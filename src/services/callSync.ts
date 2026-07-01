import type { RetellCallSummary } from "../types/retellApi.js";
import {
  getDealContactPhone,
  getRetellCallIdFromDeal,
  searchDealsWithAiCallAttempted,
} from "./hubspotDeals.js";
import { logger } from "./logger.js";
import {
  buildCallIndexes,
  findCallForDeal,
  getRetellCall,
  listRetellCalls,
  retellCallToSessionRow,
} from "./retellApi.js";
import {
  getLastSuccessfulSyncTime,
  insertSyncRun,
  updateSyncRun,
  upsertRetellSession,
} from "./supabase.js";

const SYNC_OVERLAP_MS = 24 * 60 * 60 * 1000;

export interface CallSyncOptions {
  full?: boolean;
  syncType?: "backfill" | "incremental" | "manual";
  hydrateTranscripts?: boolean;
}

export interface CallSyncResult {
  syncRunId?: string;
  dealsProcessed: number;
  sessionsUpserted: number;
  sessionsSkipped: number;
  errors: Array<{ dealId: string; error: string }>;
}

async function upsertDealCall(
  dealId: string,
  callSummary: RetellCallSummary,
  hydrateTranscripts: boolean
): Promise<{ upserted: boolean; error?: string }> {
  const call = hydrateTranscripts
    ? (await getRetellCall(callSummary.call_id)) ?? callSummary
    : callSummary;

  const row = retellCallToSessionRow(call, dealId);
  const result = await upsertRetellSession(row);

  if (!result.success) {
    return { upserted: false, error: result.error ?? "Supabase upsert failed" };
  }

  return { upserted: true };
}

export async function runCallSync(options: CallSyncOptions = {}): Promise<CallSyncResult> {
  const syncType = options.syncType ?? (options.full ? "backfill" : "incremental");
  const hydrateTranscripts = options.hydrateTranscripts ?? true;
  const result: CallSyncResult = {
    dealsProcessed: 0,
    sessionsUpserted: 0,
    sessionsSkipped: 0,
    errors: [],
  };

  const syncRun = await insertSyncRun({
    sync_type: syncType,
    status: "running",
    metadata: { full: Boolean(options.full) },
  });

  if (!syncRun.id) {
    throw new Error(syncRun.error ?? "Failed to create sync_runs row");
  }

  result.syncRunId = syncRun.id;

  try {
    const lastSync = options.full ? null : await getLastSuccessfulSyncTime();
    const modifiedSince =
      lastSync !== null ? new Date(lastSync.getTime() - SYNC_OVERLAP_MS) : undefined;

    logger.info("Starting call sync", {
      syncType,
      full: Boolean(options.full),
      modifiedSince: modifiedSince?.toISOString() ?? null,
    });

    const deals = await searchDealsWithAiCallAttempted(
      modifiedSince ? { modifiedSince } : undefined
    );

    const retellCalls = await listRetellCalls(
      options.full || !modifiedSince
        ? { callStatus: ["ended"] }
        : {
            callStatus: ["ended"],
            startAfterMs: modifiedSince!.getTime() - SYNC_OVERLAP_MS,
          }
    );

    const indexes = buildCallIndexes(retellCalls);
    const phoneCache = new Map<string, string | null>();

    for (const deal of deals) {
      result.dealsProcessed += 1;

      try {
        const dealCallId = getRetellCallIdFromDeal(deal);
        let contactPhone = phoneCache.get(deal.id) ?? null;

        if (!dealCallId && !indexes.byDealId.has(deal.id)) {
          if (!phoneCache.has(deal.id)) {
            contactPhone = await getDealContactPhone(deal.id);
            phoneCache.set(deal.id, contactPhone);
          }
        }

        const matchedCall = findCallForDeal(
          deal.id,
          dealCallId,
          contactPhone,
          indexes
        );

        if (!matchedCall) {
          result.sessionsSkipped += 1;
          continue;
        }

        const upsertResult = await upsertDealCall(
          deal.id,
          matchedCall,
          hydrateTranscripts
        );

        if (upsertResult.upserted) {
          result.sessionsUpserted += 1;
        } else {
          result.sessionsSkipped += 1;
          if (upsertResult.error) {
            result.errors.push({ dealId: deal.id, error: upsertResult.error });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ dealId: deal.id, error: message });
      }
    }

    await updateSyncRun(syncRun.id, {
      status: "success",
      completed_at: new Date().toISOString(),
      deals_processed: result.dealsProcessed,
      sessions_upserted: result.sessionsUpserted,
      sessions_skipped: result.sessionsSkipped,
      error_count: result.errors.length,
      errors: result.errors.length ? result.errors : null,
      metadata: {
        full: Boolean(options.full),
        retellCallsIndexed: retellCalls.length,
      },
    });

    logger.info("Call sync completed", {
      syncRunId: syncRun.id,
      ...result,
      errorCount: result.errors.length,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSyncRun(syncRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      deals_processed: result.dealsProcessed,
      sessions_upserted: result.sessionsUpserted,
      sessions_skipped: result.sessionsSkipped,
      error_count: result.errors.length + 1,
      errors: [...result.errors, { error: message }],
    });
    throw err;
  }
}

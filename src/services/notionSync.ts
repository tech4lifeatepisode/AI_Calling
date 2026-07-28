import {
  getLastSuccessfulSyncTimeByType,
  insertSyncRun,
  listRetellSessionsUpdatedSince,
  updateSyncRun,
} from "./supabase.js";
import { logger } from "./logger.js";
import { syncRetellSessionsBatch } from "./notion.js";

const NOTION_SYNC_OVERLAP_MS = 5 * 60 * 1000;

export interface NotionSyncOptions {
  full?: boolean;
  syncType?: "backfill" | "incremental" | "manual";
  limit?: number;
}

export interface NotionSyncResult {
  syncRunId?: string;
  total: number;
  synced: number;
  failed: number;
  errors: Array<{ sessionId: string; error: string }>;
}

export async function runNotionSync(options: NotionSyncOptions = {}): Promise<NotionSyncResult> {
  const syncType = options.syncType ?? (options.full ? "backfill" : "incremental");
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 1000);

  const result: NotionSyncResult = {
    total: 0,
    synced: 0,
    failed: 0,
    errors: [],
  };

  const syncRun = await insertSyncRun({
    sync_type: `notion_${syncType}`,
    status: "running",
    metadata: { full: Boolean(options.full), limit },
  });

  if (!syncRun.id) {
    throw new Error(syncRun.error ?? "Failed to create sync_runs row");
  }

  result.syncRunId = syncRun.id;

  try {
    const lastSync = options.full ? null : await getLastSuccessfulSyncTimeByType("notion");
    const updatedSince =
      lastSync !== null ? new Date(lastSync.getTime() - NOTION_SYNC_OVERLAP_MS) : undefined;

    const rows = updatedSince
      ? await listRetellSessionsUpdatedSince(updatedSince, limit)
      : await listRetellSessionsUpdatedSince(new Date(0), limit);

    result.total = rows.length;

    logger.info("Starting Notion sync", {
      syncType,
      full: Boolean(options.full),
      updatedSince: updatedSince?.toISOString() ?? null,
      rowCount: rows.length,
    });

    const batch = await syncRetellSessionsBatch(rows, 350);
    result.synced = batch.synced;
    result.failed = batch.failed;
    result.errors = batch.errors;

    await updateSyncRun(syncRun.id, {
      status: "success",
      completed_at: new Date().toISOString(),
      sessions_upserted: batch.synced,
      sessions_skipped: batch.failed,
      error_count: batch.failed,
      errors: batch.errors.length ? batch.errors : null,
      metadata: {
        full: Boolean(options.full),
        total: batch.total,
      },
    });

    logger.info("Notion sync completed", {
      syncRunId: syncRun.id,
      ...result,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSyncRun(syncRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error_count: result.failed + 1,
      errors: [...result.errors, { error: message }],
    });
    throw err;
  }
}

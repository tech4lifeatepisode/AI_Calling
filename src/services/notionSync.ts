import { getEnv } from "./env.js";
import { logger } from "./logger.js";
import {
  NOTION_SYNC_INITIAL_CURSOR,
  NOTION_SYNC_NAME,
  nextCursor,
  type CursorRowResult,
} from "./notionCursor.js";
import { syncRetellSessionToNotion } from "./notion.js";
import {
  countRetellSessionsTouchedSince,
  getRetellSessionsByIds,
  getSyncState,
  insertSyncRun,
  listOpenSyncErrorSessionIds,
  listRetellSessionsTouchedSince,
  listRetellSessionsUpdatedAfter,
  resolveSyncError,
  updateSyncRun,
  upsertSyncState,
  type SyncStateRow,
} from "./supabase.js";
import type { RetellSessionRow } from "../types/supabase.js";

const PAGE_SIZE = 100;

export interface NotionSyncResult {
  syncRunId?: string;
  total: number;
  created: number;
  updated: number;
  synced: number;
  failed: number;
  errors: Array<{ sessionId: string; error: string }>;
  cursor: string | null;
  dryRun?: boolean;
}

function emptyResult(cursor: string | null): NotionSyncResult {
  return {
    total: 0,
    created: 0,
    updated: 0,
    synced: 0,
    failed: 0,
    errors: [],
    cursor,
  };
}

async function saveCursorIfAhead(current: string | null, next: string | null): Promise<string | null> {
  if (!next) {
    return current;
  }
  if (current && Date.parse(current) >= Date.parse(next)) {
    return current;
  }

  await upsertSyncState({
    name: NOTION_SYNC_NAME,
    cursor: next,
    meta: { last_row_success_at: new Date().toISOString() },
  });
  return next;
}

async function syncRows(
  rows: RetellSessionRow[],
  cache: Map<string, string>,
  result: NotionSyncResult
): Promise<CursorRowResult[]> {
  const outcomes: CursorRowResult[] = [];

  for (const row of rows) {
    const synced = await syncRetellSessionToNotion(row, { force: true, cache });
    result.total += 1;
    if (synced.success && synced.action !== "skipped") {
      result.synced += 1;
      if (synced.action === "created") {
        result.created += 1;
      } else {
        result.updated += 1;
      }
      outcomes.push({ updatedAt: row.updated_at ?? new Date(0).toISOString(), ok: true });
    } else if (!synced.success) {
      result.failed += 1;
      result.errors.push({
        sessionId: row.session_id,
        error: synced.error ?? "Unknown error",
      });
      logger.warn("Notion row sync failed", {
        sessionId: row.session_id,
        error: synced.error,
      });
      outcomes.push({ updatedAt: row.updated_at ?? new Date(0).toISOString(), ok: false });
    }
  }

  return outcomes;
}

async function retryOpenErrors(
  cache: Map<string, string>,
  result: NotionSyncResult
): Promise<Set<string>> {
  const sessionIds = await listOpenSyncErrorSessionIds(NOTION_SYNC_NAME, PAGE_SIZE);
  const rows = await getRetellSessionsByIds(sessionIds);
  const found = new Set(rows.map((row) => row.session_id));

  for (const sessionId of sessionIds) {
    if (!found.has(sessionId)) {
      await resolveSyncError(NOTION_SYNC_NAME, sessionId);
    }
  }

  await syncRows(rows, cache, result);
  return found;
}

async function markRun(meta: Record<string, unknown>): Promise<void> {
  await upsertSyncState({
    name: NOTION_SYNC_NAME,
    meta: { ...meta, last_run_at: new Date().toISOString() },
  });
}

export async function runNotionIncrementalSync(): Promise<NotionSyncResult> {
  if (!getEnv().NOTION_SYNC_ENABLED) {
    logger.info("Notion sync skipped; NOTION_SYNC_ENABLED is false");
    return emptyResult(null);
  }

  const startedAt = Date.now();
  const state = await getSyncState(NOTION_SYNC_NAME);
  const storedCursor = state?.cursor ?? null;
  let cursor = storedCursor ?? NOTION_SYNC_INITIAL_CURSOR;
  const cache = new Map<string, string>();
  const result = emptyResult(cursor);

  logger.info("Notion sync run started", {
    mode: "incremental",
    cursor,
    pageSize: PAGE_SIZE,
  });

  const syncRun = await insertSyncRun({
    sync_type: "notion_incremental",
    status: "running",
    metadata: { cursor },
  });

  try {
    const retried = await retryOpenErrors(cache, result);
    const rows = (await listRetellSessionsUpdatedAfter(cursor, PAGE_SIZE)).filter(
      (row) => !retried.has(row.session_id)
    );
    const outcomes = await syncRows(rows, cache, result);
    const advanced = rows.length === 0 && retried.size === 0 ? cursor : nextCursor(cursor, outcomes);
    cursor = (await saveCursorIfAhead(storedCursor, advanced)) ?? cursor;
    result.cursor = cursor;

    await markRun({
      last_mode: "incremental",
      created: result.created,
      updated: result.updated,
      failed: result.failed,
    });

    if (syncRun.id) {
      await updateSyncRun(syncRun.id, {
        status: "success",
        completed_at: new Date().toISOString(),
        sessions_upserted: result.synced,
        sessions_skipped: result.failed,
        error_count: result.failed,
        errors: result.errors.length ? result.errors : null,
        metadata: { cursor, created: result.created, updated: result.updated, failed: result.failed },
      });
      result.syncRunId = syncRun.id;
    }

    logger.info("Notion sync run finished", {
      mode: "incremental",
      processed: result.total,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
      cursor,
      durationMs: Date.now() - startedAt,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (syncRun.id) {
      await updateSyncRun(syncRun.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error_count: result.failed + 1,
        errors: [...result.errors, { error: message }],
      }).catch(() => undefined);
    }
    logger.error("Notion sync run failed", { mode: "incremental", message });
    throw err;
  }
}

export async function runNotionBackfill(options: {
  since: string;
  dryRun?: boolean;
}): Promise<NotionSyncResult> {
  const since = new Date(options.since);
  if (Number.isNaN(since.getTime())) {
    throw new Error(`Invalid --since value: ${options.since}`);
  }
  const sinceIso = since.toISOString();
  const totalMatching = await countRetellSessionsTouchedSince(sinceIso);

  if (options.dryRun) {
    const result = emptyResult(null);
    result.total = totalMatching;
    result.dryRun = true;
    logger.info("Notion backfill dry run", { since: sinceIso, rows: totalMatching });
    return result;
  }

  const startedAt = Date.now();
  const state = await getSyncState(NOTION_SYNC_NAME);
  let cursor = state?.cursor ?? null;
  let blocked = false;
  const cache = new Map<string, string>();
  const result = emptyResult(cursor);

  logger.info("Notion sync run started", {
    mode: "backfill",
    since: sinceIso,
    rows: totalMatching,
    cursor,
  });

  let offset = 0;
  for (;;) {
    const rows = await listRetellSessionsTouchedSince(sinceIso, offset, PAGE_SIZE);
    if (rows.length === 0) {
      break;
    }

    const outcomes = await syncRows(rows, cache, result);
    if (!blocked) {
      if (outcomes.some((outcome) => !outcome.ok)) {
        blocked = true;
      }
      cursor = await saveCursorIfAhead(cursor, nextCursor(cursor, outcomes));
      result.cursor = cursor;
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  await markRun({
    last_mode: "backfill",
    since: sinceIso,
    created: result.created,
    updated: result.updated,
    failed: result.failed,
  });

  logger.info("Notion sync run finished", {
    mode: "backfill",
    processed: result.total,
    created: result.created,
    updated: result.updated,
    failed: result.failed,
    cursor: result.cursor,
    durationMs: Date.now() - startedAt,
  });

  return result;
}

export async function readNotionSyncCursor(): Promise<SyncStateRow | null> {
  return getSyncState(NOTION_SYNC_NAME);
}

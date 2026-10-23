import type { Request, Response } from "express";
import {
  NOTION_SYNC_LAG_LIMIT_MINUTES,
  NOTION_SYNC_NAME,
  notionSyncLagMinutes,
} from "../services/notionCursor.js";
import { logger } from "../services/logger.js";
import {
  countOpenSyncErrors,
  getRetellSessionTimestampBounds,
  getSyncState,
} from "../services/supabase.js";

export async function notionSyncHealthHandler(_req: Request, res: Response): Promise<void> {
  try {
    const [bounds, state, pendingErrors] = await Promise.all([
      getRetellSessionTimestampBounds(),
      getSyncState(NOTION_SYNC_NAME),
      countOpenSyncErrors(NOTION_SYNC_NAME),
    ]);

    const lagMinutes = notionSyncLagMinutes({
      latestUpdatedAt: bounds.latestUpdatedAt,
      oldestUpdatedAt: bounds.oldestUpdatedAt,
      cursor: state?.cursor ?? null,
    });
    const ok = lagMinutes <= NOTION_SYNC_LAG_LIMIT_MINUTES;
    const lastSuccessAt =
      (typeof state?.meta?.last_row_success_at === "string" ? state.meta.last_row_success_at : null) ??
      state?.updated_at ??
      null;

    const body = {
      ok,
      cursor: state?.cursor ?? null,
      lastSuccessAt,
      lastRunAt: typeof state?.meta?.last_run_at === "string" ? state.meta.last_run_at : null,
      lagMinutes: Math.round(lagMinutes * 10) / 10,
      pendingErrors,
      latestSupabaseUpdatedAt: bounds.latestUpdatedAt,
      latestSupabaseCreatedAt: bounds.latestCreatedAt,
    };

    res.status(ok ? 200 : 503).json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion sync health check failed", { message });
    res.status(503).json({
      ok: false,
      cursor: null,
      lastSuccessAt: null,
      lagMinutes: null,
      pendingErrors: null,
      error: message,
    });
  }
}

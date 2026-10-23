import type { Request, Response } from "express";
import { setupNotionDatabase } from "../services/notion.js";
import { runNotionBackfill, runNotionIncrementalSync } from "../services/notionSync.js";
import { logger } from "../services/logger.js";

export async function syncNotionHandler(req: Request, res: Response): Promise<void> {
  try {
    const setup =
      req.query.setup === "true" ||
      req.body?.setup === true ||
      req.body?.mode === "setup";

    const full =
      req.query.full === "true" ||
      req.body?.full === true ||
      req.body?.mode === "backfill" ||
      setup;

    const setupResult = setup ? await setupNotionDatabase() : null;

    const since =
      (typeof req.query.since === "string" ? req.query.since : undefined) ??
      (typeof req.body?.since === "string" ? req.body.since : undefined);

    const result =
      full || since
        ? await runNotionBackfill({ since: since ?? "2026-10-01T00:00:00Z" })
        : await runNotionIncrementalSync();

    res.json({
      success: true,
      full,
      setup: setupResult,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion batch sync failed", { message });
    res.status(500).json({ success: false, error: message });
  }
}

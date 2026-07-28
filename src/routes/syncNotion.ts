import type { Request, Response } from "express";
import { setupNotionDatabase } from "../services/notion.js";
import { runNotionSync } from "../services/notionSync.js";
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

    const limitRaw = req.query.limit ?? req.body?.limit;
    const limit = limitRaw != null ? Number(limitRaw) : undefined;

    const setupResult = setup ? await setupNotionDatabase() : null;

    const result = await runNotionSync({
      full,
      syncType: full ? "backfill" : "manual",
      limit,
    });

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

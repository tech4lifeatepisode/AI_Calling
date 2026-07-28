import type { Request, Response } from "express";
import { runNotionSync } from "../services/notionSync.js";
import { logger } from "../services/logger.js";

export async function syncNotionHandler(req: Request, res: Response): Promise<void> {
  try {
    const full =
      req.query.full === "true" ||
      req.body?.full === true ||
      req.body?.mode === "backfill";

    const limitRaw = req.query.limit ?? req.body?.limit;
    const limit = limitRaw != null ? Number(limitRaw) : undefined;

    const result = await runNotionSync({
      full,
      syncType: full ? "backfill" : "manual",
      limit,
    });

    res.json({
      success: true,
      full,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion batch sync failed", { message });
    res.status(500).json({ success: false, error: message });
  }
}

import type { Request, Response } from "express";
import { runCallSync } from "../services/callSync.js";
import { logger } from "../services/logger.js";

export async function syncCallDataHandler(req: Request, res: Response): Promise<void> {
  try {
    const full =
      req.query.full === "true" ||
      req.body?.full === true ||
      req.body?.mode === "backfill";

    const result = await runCallSync({
      full,
      syncType: full ? "backfill" : "incremental",
    });

    res.json({
      success: true,
      full,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Call sync handler error", { message });
    res.status(500).json({ success: false, error: message });
  }
}

import type { Request, Response } from "express";
import { setupNotionDatabase } from "../services/notion.js";
import { runNotionSync } from "../services/notionSync.js";
import { logger } from "../services/logger.js";

export async function setupNotionHandler(req: Request, res: Response): Promise<void> {
  try {
    const setup = await setupNotionDatabase();
    const sync =
      req.query.sync === "true" || req.body?.sync === true
        ? await runNotionSync({ full: true, syncType: "backfill" })
        : null;

    res.json({
      success: true,
      setup,
      sync,
      hint: "Set NOTION_RETELL_DATABASE_ID in Render to persist the database id across redeploys.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion setup failed", { message });
    res.status(500).json({ success: false, error: message });
  }
}

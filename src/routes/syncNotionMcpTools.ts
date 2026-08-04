import type { Request, Response } from "express";
import { syncMcpToolsDocToNotion } from "../services/notionMcpToolsDoc.js";
import { logger } from "../services/logger.js";

export async function syncNotionMcpToolsHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await syncMcpToolsDocToNotion();

    if (!result.success) {
      res.status(result.error?.includes("not connected") ? 503 : 500).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion MCP tools doc route failed", { message });
    res.status(500).json({ success: false, error: message });
  }
}

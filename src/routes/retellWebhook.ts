import type { Request, Response } from "express";
import { normalizeRetellSession, type RetellPayload } from "../types/retell.js";
import { upsertRetellSession } from "../services/supabase.js";
import { logger } from "../services/logger.js";

export async function retellWebhookHandler(req: Request, res: Response): Promise<void> {
  try {
    const payload = (req.body ?? {}) as RetellPayload;
    const normalized = normalizeRetellSession(payload);
    const result = await upsertRetellSession(normalized);

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error ?? "Failed to save session",
      });
      return;
    }

    logger.info("Retell webhook session saved", { sessionId: normalized.session_id });

    res.json({
      success: true,
      sessionId: normalized.session_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Retell webhook error", { message });
    res.status(400).json({ success: false, error: message });
  }
}

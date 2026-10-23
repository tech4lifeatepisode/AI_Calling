import { logger } from "./logger.js";

export function enqueueRetellSessionNotionSync(sessionId: string): void {
  void (async () => {
    try {
      const { getRetellSessionBySessionId } = await import("./supabase.js");
      const { syncRetellSessionToNotion } = await import("./notion.js");
      const row = await getRetellSessionBySessionId(sessionId);
      if (!row) {
        return;
      }
      const result = await syncRetellSessionToNotion(row);
      if (!result.success && result.error) {
        logger.warn("Notion sync after upsert failed", {
          sessionId,
          error: result.error,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("Notion sync after upsert failed", { sessionId, error: message });
    }
  })();
}

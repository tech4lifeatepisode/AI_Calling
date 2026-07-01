import dotenv from "dotenv";
import { runCallSync } from "../src/services/callSync.js";
import { logger } from "../src/services/logger.js";

dotenv.config();

async function main(): Promise<void> {
  logger.info("Starting one-time HubSpot deal → Retell call backfill");

  const result = await runCallSync({
    full: true,
    syncType: "backfill",
    hydrateTranscripts: true,
  });

  logger.info("Backfill completed", {
    syncRunId: result.syncRunId,
    dealsProcessed: result.dealsProcessed,
    sessionsUpserted: result.sessionsUpserted,
    sessionsSkipped: result.sessionsSkipped,
    errorCount: result.errors.length,
  });

  if (result.errors.length > 0) {
    logger.warn("Backfill completed with deal-level errors", {
      sample: result.errors.slice(0, 10),
    });
  }
}

main().catch((err) => {
  logger.error("backfillCallSync failed", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

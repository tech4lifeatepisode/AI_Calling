import dotenv from "dotenv";
import { getEnv } from "./services/env.js";
import { runCallSync } from "./services/callSync.js";
import { logger } from "./services/logger.js";
import { createApp } from "./server.js";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

let syncInProgress = false;

function startSyncScheduler(): void {
  const env = getEnv();

  if (!env.SYNC_ENABLED || !env.RETELL_API_KEY) {
    if (env.SYNC_ENABLED && !env.RETELL_API_KEY) {
      logger.warn("SYNC_ENABLED is true but RETELL_API_KEY is missing; scheduler disabled");
    }
    return;
  }

  const intervalMs = env.SYNC_INTERVAL_MS;
  const initialDelayMs = env.SYNC_INITIAL_DELAY_MS;

  logger.info("Call sync scheduler started", {
    intervalMs,
    initialDelayMs,
    mode: "incremental",
  });

  const runScheduledSync = (): void => {
    if (syncInProgress) {
      logger.warn("Skipping scheduled call sync; previous run still in progress");
      return;
    }

    syncInProgress = true;

    void runCallSync({ syncType: "incremental" })
      .then((result) => {
        logger.info("Scheduled call sync finished", {
          syncRunId: result.syncRunId,
          dealsProcessed: result.dealsProcessed,
          sessionsUpserted: result.sessionsUpserted,
          sessionsSkipped: result.sessionsSkipped,
          errorCount: result.errors.length,
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Scheduled call sync failed", { message });
      })
      .finally(() => {
        syncInProgress = false;
      });
  };

  setTimeout(runScheduledSync, initialDelayMs);
  setInterval(runScheduledSync, intervalMs);
}

try {
  const env = getEnv();
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`, {
      nodeEnv: env.NODE_ENV,
      syncEnabled: env.SYNC_ENABLED,
      syncIntervalMs: env.SYNC_ENABLED ? env.SYNC_INTERVAL_MS : null,
    });
    startSyncScheduler();
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("Failed to start server", { message });
  process.exit(1);
}

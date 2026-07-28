import dotenv from "dotenv";
import { getEnv } from "./services/env.js";
import { runCallSync } from "./services/callSync.js";
import { runNotionSync } from "./services/notionSync.js";
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

function startNotionSyncScheduler(): void {
  const env = getEnv();

  if (!env.NOTION_SYNC_ENABLED || !env.NOTION_API_KEY) {
    if (env.NOTION_SYNC_ENABLED && !env.NOTION_API_KEY) {
      logger.warn("NOTION_SYNC_ENABLED is true but NOTION_API_KEY is missing; Notion scheduler disabled");
    }
    return;
  }

  let notionSyncInProgress = false;
  const intervalMs = env.NOTION_SYNC_INTERVAL_MS;
  const initialDelayMs = env.NOTION_SYNC_INITIAL_DELAY_MS;

  logger.info("Notion live sync scheduler started", {
    intervalMs,
    initialDelayMs,
    sprintsPageId: env.NOTION_SPRINTS_PAGE_ID,
    databaseTitle: env.NOTION_DATABASE_TITLE,
  });

  const runScheduledNotionSync = (): void => {
    if (notionSyncInProgress) {
      logger.warn("Skipping scheduled Notion sync; previous run still in progress");
      return;
    }

    notionSyncInProgress = true;

    void runNotionSync({ syncType: "incremental" })
      .then((result) => {
        logger.info("Scheduled Notion sync finished", {
          syncRunId: result.syncRunId,
          total: result.total,
          synced: result.synced,
          failed: result.failed,
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Scheduled Notion sync failed", { message });
      })
      .finally(() => {
        notionSyncInProgress = false;
      });
  };

  setTimeout(runScheduledNotionSync, initialDelayMs);
  setInterval(runScheduledNotionSync, intervalMs);
}

try {
  const env = getEnv();
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`, {
      nodeEnv: env.NODE_ENV,
      syncEnabled: env.SYNC_ENABLED,
      syncIntervalMs: env.SYNC_ENABLED ? env.SYNC_INTERVAL_MS : null,
      notionSyncEnabled: env.NOTION_SYNC_ENABLED,
      notionSyncIntervalMs: env.NOTION_SYNC_ENABLED ? env.NOTION_SYNC_INTERVAL_MS : null,
    });
    startSyncScheduler();
    startNotionSyncScheduler();
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("Failed to start server", { message });
  process.exit(1);
}

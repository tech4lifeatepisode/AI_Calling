import type { Request, Response } from "express";
import { getNotionDatabaseInfo } from "../services/notion.js";
import { getEnv } from "../services/env.js";

export async function notionStatusHandler(_req: Request, res: Response): Promise<void> {
  const env = getEnv();
  const database = env.NOTION_SYNC_ENABLED ? await getNotionDatabaseInfo() : null;

  res.json({
    success: true,
    syncEnabled: env.NOTION_SYNC_ENABLED,
    sprintsPageId: env.NOTION_SPRINTS_PAGE_ID,
    databaseTitle: env.NOTION_DATABASE_TITLE,
    databaseIdConfigured: Boolean(env.NOTION_RETELL_DATABASE_ID),
    apiKeyConfigured: Boolean(env.NOTION_API_KEY),
    database,
    liveSync: {
      onUpsert: env.NOTION_SYNC_ENABLED,
      intervalMs: env.NOTION_SYNC_INTERVAL_MS,
    },
  });
}

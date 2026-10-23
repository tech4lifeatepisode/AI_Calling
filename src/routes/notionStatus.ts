import type { Request, Response } from "express";
import { getNotionDatabaseInfo } from "../services/notion.js";
import { getNotionConnectionStatus, getNotionReauthUrl } from "../services/notionAuth.js";
import { getEnv } from "../services/env.js";

export async function notionStatusHandler(_req: Request, res: Response): Promise<void> {
  const env = getEnv();
  const connection = await getNotionConnectionStatus();
  const database = env.NOTION_SYNC_ENABLED ? await getNotionDatabaseInfo() : null;

  res.json({
    success: true,
    syncEnabled: env.NOTION_SYNC_ENABLED,
    redirectUri: env.NOTION_REDIRECT_URI,
    sprintsPageId: env.NOTION_SPRINTS_PAGE_ID,
    databaseTitle: env.NOTION_DATABASE_TITLE,
    databaseIdConfigured: Boolean(env.NOTION_RETELL_DATABASE_ID),
    dataSourceId: env.NOTION_RETELL_DATA_SOURCE_ID,
    oauthConfigured: Boolean(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET),
    apiKeyConfigured: Boolean(env.NOTION_API_KEY),
    refreshTokenConfigured: Boolean(env.NOTION_REFRESH_TOKEN),
    connection,
    reauthUrl: connection.needsReauth ? getNotionReauthUrl() : undefined,
    database,
    discoveredDatabases: database?.availableDatabases,
    liveSync: {
      onUpsert: env.NOTION_SYNC_ENABLED,
      cron: "*/5 * * * *",
      health: "GET /health/notion-sync",
    },
    mcpToolsDoc: {
      sectionTitle: env.NOTION_MCP_TOOLS_SECTION_TITLE,
      sectionBlockId: env.NOTION_MCP_TOOLS_SECTION_BLOCK_ID ?? null,
      syncEndpoint: "POST /cron/sync-notion-mcp-tools",
    },
  });
}

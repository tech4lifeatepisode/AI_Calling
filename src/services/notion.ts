import type { RetellSessionRow } from "../types/supabase.js";
import { getEnv } from "./env.js";
import { logger } from "./logger.js";
import { refreshStoredNotionTokenIfNeeded } from "./notionAuth.js";

const NOTION_BASE = "https://api.notion.com/v1";

let cachedDatabaseId: string | null = null;

function notionHeaders(apiKey: string, apiVersion: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": apiVersion,
    "Content-Type": "application/json",
  };
}

async function getNotionApiKey(): Promise<string> {
  const apiKey = await refreshStoredNotionTokenIfNeeded();
  if (!apiKey) {
    throw new Error("Notion is not connected. Open /auth/notion to authorize.");
  }
  return apiKey;
}

function richText(value: string | null | undefined) {
  const content = (value ?? "").slice(0, 2000);
  if (!content) return [];
  return [{ text: { content } }];
}

function mapRowToNotionProperties(row: RetellSessionRow) {
  return {
    "Session ID": {
      title: [{ text: { content: row.session_id } }],
    },
    "Call time": row.session_time
      ? { date: { start: row.session_time } }
      : { date: null },
    "Duration (s)":
      row.duration_seconds != null ? { number: row.duration_seconds } : { number: null },
    Status: row.session_status
      ? { select: { name: row.session_status.slice(0, 100) } }
      : { select: null },
    Sentiment: row.user_sentiment
      ? { select: { name: row.user_sentiment.slice(0, 100) } }
      : { select: null },
    Outcome: row.session_outcome
      ? { select: { name: row.session_outcome.slice(0, 100) } }
      : { select: null },
    Contact: { rich_text: richText(row.hubspot_contact_name) },
    Email: row.hubspot_contact_email
      ? { email: row.hubspot_contact_email }
      : { email: null },
    Phone: row.hubspot_contact_phone
      ? { phone_number: row.hubspot_contact_phone }
      : { phone_number: null },
    Deal: { rich_text: richText(row.hubspot_deal_name) },
    "Deal stage": row.hubspot_deal_stage
      ? { select: { name: row.hubspot_deal_stage.slice(0, 100) } }
      : { select: null },
    Agent: { rich_text: richText(row.agent_name) },
    Direction: row.direction
      ? { select: { name: row.direction.slice(0, 100) } }
      : { select: null },
    Cost: row.cost != null ? { number: row.cost } : { number: null },
    "Total price":
      row.latest_total_price != null ? { number: row.latest_total_price } : { number: null },
    Recording: row.recording_url ? { url: row.recording_url } : { url: null },
    "Retell log": row.public_log_url ? { url: row.public_log_url } : { url: null },
    "Supabase updated": row.updated_at
      ? { date: { start: row.updated_at } }
      : { date: null },
  };
}

async function getDatabaseTitle(
  apiKey: string,
  databaseId: string,
  apiVersion: string
): Promise<string | null> {
  const res = await fetch(`${NOTION_BASE}/databases/${databaseId}`, {
    headers: notionHeaders(apiKey, apiVersion),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as {
    title?: Array<{ plain_text?: string }>;
  };

  return data.title?.map((part) => part.plain_text ?? "").join("") || null;
}

async function listBlockChildren(
  apiKey: string,
  blockId: string,
  apiVersion: string
): Promise<Array<{ id: string; type: string; has_children?: boolean }>> {
  const results: Array<{ id: string; type: string; has_children?: boolean }> = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${NOTION_BASE}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) {
      url.searchParams.set("start_cursor", cursor);
    }

    const res = await fetch(url, {
      headers: notionHeaders(apiKey, apiVersion),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Notion block lookup failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      results: Array<{ id: string; type: string; has_children?: boolean }>;
      has_more?: boolean;
      next_cursor?: string | null;
    };

    results.push(...data.results);
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

async function findDatabaseOnPage(
  apiKey: string,
  pageId: string,
  expectedTitle: string,
  apiVersion: string
): Promise<string | null> {
  const directTitle = await getDatabaseTitle(apiKey, pageId, apiVersion);
  if (directTitle?.toLowerCase() === expectedTitle.toLowerCase()) {
    return pageId;
  }

  const blocks = await listBlockChildren(apiKey, pageId, apiVersion);

  for (const block of blocks) {
    if (block.type !== "child_database") {
      continue;
    }

    const title = await getDatabaseTitle(apiKey, block.id, apiVersion);
    if (title?.toLowerCase() === expectedTitle.toLowerCase()) {
      return block.id;
    }
  }

  return null;
}

export async function resolveNotionDatabaseId(): Promise<string> {
  if (cachedDatabaseId) {
    return cachedDatabaseId;
  }

  const env = getEnv();
  if (env.NOTION_RETELL_DATABASE_ID) {
    cachedDatabaseId = env.NOTION_RETELL_DATABASE_ID;
    return cachedDatabaseId;
  }

  const apiKey = await getNotionApiKey();
  const databaseId = await findDatabaseOnPage(
    apiKey,
    env.NOTION_SPRINTS_PAGE_ID,
    env.NOTION_DATABASE_TITLE,
    env.NOTION_API_VERSION
  );

  if (!databaseId) {
    throw new Error(
      `Could not find Notion database "${env.NOTION_DATABASE_TITLE}" on page ${env.NOTION_SPRINTS_PAGE_ID}. Share the page with your integration or set NOTION_RETELL_DATABASE_ID.`
    );
  }

  cachedDatabaseId = databaseId;
  logger.info("Resolved Notion database for retell_sessions sync", {
    databaseId,
    pageId: env.NOTION_SPRINTS_PAGE_ID,
    title: env.NOTION_DATABASE_TITLE,
  });

  return databaseId;
}

async function findNotionPageBySessionId(
  sessionId: string,
  apiKey: string,
  databaseId: string,
  apiVersion: string
): Promise<string | null> {
  const res = await fetch(`${NOTION_BASE}/databases/${databaseId}/query`, {
    method: "POST",
    headers: notionHeaders(apiKey, apiVersion),
    body: JSON.stringify({
      filter: {
        property: "Session ID",
        title: { equals: sessionId },
      },
      page_size: 1,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion query failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { results: Array<{ id: string }> };
  return data.results[0]?.id ?? null;
}

export async function syncRetellSessionToNotion(
  row: RetellSessionRow
): Promise<{ success: boolean; notionPageId?: string; error?: string }> {
  const env = getEnv();
  if (!env.NOTION_SYNC_ENABLED) {
    return { success: true };
  }

  try {
    const apiKey = await getNotionApiKey();
    const databaseId = await resolveNotionDatabaseId();
    const properties = mapRowToNotionProperties(row);
    const existingPageId = await findNotionPageBySessionId(
      row.session_id,
      apiKey,
      databaseId,
      env.NOTION_API_VERSION
    );

    if (existingPageId) {
      const res = await fetch(`${NOTION_BASE}/pages/${existingPageId}`, {
        method: "PATCH",
        headers: notionHeaders(apiKey, env.NOTION_API_VERSION),
        body: JSON.stringify({ properties }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Notion update failed (${res.status}): ${body}` };
      }

      return { success: true, notionPageId: existingPageId };
    }

    const res = await fetch(`${NOTION_BASE}/pages`, {
      method: "POST",
      headers: notionHeaders(apiKey, env.NOTION_API_VERSION),
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Notion create failed (${res.status}): ${body}` };
    }

    const created = (await res.json()) as { id: string };
    return { success: true, notionPageId: created.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Notion sync failed", { sessionId: row.session_id, message });
    return { success: false, error: message };
  }
}

export interface NotionSyncBatchResult {
  total: number;
  synced: number;
  failed: number;
  errors: Array<{ sessionId: string; error: string }>;
}

export async function syncRetellSessionsBatch(
  rows: RetellSessionRow[],
  delayMs = 350
): Promise<NotionSyncBatchResult> {
  const result: NotionSyncBatchResult = {
    total: rows.length,
    synced: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows) {
    const syncResult = await syncRetellSessionToNotion(row);
    if (syncResult.success) {
      result.synced += 1;
    } else {
      result.failed += 1;
      result.errors.push({
        sessionId: row.session_id,
        error: syncResult.error ?? "Unknown error",
      });
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return result;
}

export async function getNotionDatabaseInfo(): Promise<{
  success: boolean;
  databaseId?: string;
  title?: string;
  error?: string;
}> {
  const env = getEnv();

  if (!env.NOTION_API_KEY && !(await refreshStoredNotionTokenIfNeeded())) {
    return { success: false, error: "Notion is not connected. Open /auth/notion to authorize." };
  }

  try {
    const databaseId = await resolveNotionDatabaseId();
    const apiKey = await getNotionApiKey();
    const title = await getDatabaseTitle(apiKey, databaseId, env.NOTION_API_VERSION);

    return {
      success: true,
      databaseId,
      title: title ?? env.NOTION_DATABASE_TITLE,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export function resetNotionDatabaseCache(): void {
  cachedDatabaseId = null;
}

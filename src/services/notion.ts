import type { RetellSessionRow } from "../types/supabase.js";
import { getEnv } from "./env.js";
import { logger } from "./logger.js";
import { getValidNotionAccessToken } from "./notionAuth.js";
import { mapRowToNotionProperties } from "./notionMap.js";
import { NOTION_SYNC_NAME } from "./notionCursor.js";
import { resolveSyncError, upsertSyncError } from "./supabase.js";

export { chunkRichTextForNotion, normalizeTranscriptForNotion } from "./notionMap.js";

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_DATA_SOURCE_VERSION = "2025-09-03";
const NOTION_RATE_LIMIT_MAX_ATTEMPTS = 6;
const NOTION_REQUEST_GAP_MS = 350;

let cachedDatabaseId: string | null = null;
let cachedApiKey: { key: string; until: number } | null = null;
let notionPace: Promise<void> = Promise.resolve();
let notionNextAt = 0;

export interface NotionSessionSyncResult {
  success: boolean;
  action?: "created" | "updated" | "skipped";
  notionPageId?: string;
  error?: string;
}

function notionHeaders(apiKey: string, apiVersion: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": apiVersion,
    "Content-Type": "application/json",
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function paceNotion(): Promise<void> {
  const run = notionPace.then(async () => {
    const wait = notionNextAt - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    notionNextAt = Date.now() + NOTION_REQUEST_GAP_MS;
  });
  notionPace = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.max(seconds * 1000, 1000);
    }
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      return Math.max(date - Date.now(), 1000);
    }
  }
  return Math.min(1000 * 2 ** attempt, 30_000);
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function notionFetch(
  url: string | URL,
  init: RequestInit,
  label: string
): Promise<Response> {
  for (let attempt = 1; attempt <= NOTION_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
    await paceNotion();
    const res = await fetch(url, init);
    if (!shouldRetryStatus(res.status) || attempt >= NOTION_RATE_LIMIT_MAX_ATTEMPTS) {
      return res;
    }

    const delayMs = retryDelayMs(res, attempt);
    await res.text().catch(() => "");
    logger.warn("Notion request retrying", { label, attempt, status: res.status, delayMs });
    await sleep(delayMs);
  }

  throw new Error(`Notion request failed: ${label}`);
}

function syncApiVersion(): string {
  const env = getEnv();
  return env.NOTION_RETELL_DATA_SOURCE_ID ? NOTION_DATA_SOURCE_VERSION : env.NOTION_API_VERSION;
}

function retellQueryUrl(databaseId: string): string {
  const env = getEnv();
  if (env.NOTION_RETELL_DATA_SOURCE_ID) {
    return `${NOTION_BASE}/data_sources/${env.NOTION_RETELL_DATA_SOURCE_ID}/query`;
  }
  return `${NOTION_BASE}/databases/${databaseId}/query`;
}

function retellPageParent(databaseId: string): Record<string, string> {
  const env = getEnv();
  if (env.NOTION_RETELL_DATA_SOURCE_ID) {
    return {
      type: "data_source_id",
      data_source_id: env.NOTION_RETELL_DATA_SOURCE_ID,
    };
  }
  return { type: "database_id", database_id: databaseId };
}

async function getNotionApiKey(): Promise<string> {
  if (cachedApiKey && cachedApiKey.until > Date.now()) {
    return cachedApiKey.key;
  }

  const resolved = await getValidNotionAccessToken();
  if (!resolved) {
    cachedApiKey = null;
    throw new Error(
      "Notion token is invalid. Re-authorize at /auth/notion, or set NOTION_API_KEY to an internal integration secret."
    );
  }

  cachedApiKey = { key: resolved.accessToken, until: Date.now() + 10 * 60 * 1000 };
  return resolved.accessToken;
}

async function getDatabaseTitle(
  apiKey: string,
  databaseId: string,
  apiVersion: string
): Promise<string | null> {
  const res = await notionFetch(
    `${NOTION_BASE}/databases/${databaseId}`,
    { headers: notionHeaders(apiKey, apiVersion) },
    `getDatabaseTitle:${databaseId}`
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion database lookup failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    title?: Array<{ plain_text?: string }>;
  };

  return data.title?.map((part) => part.plain_text ?? "").join("") || null;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  child_page?: { title?: string };
  heading_1?: { rich_text?: Array<{ plain_text?: string }> };
  heading_2?: { rich_text?: Array<{ plain_text?: string }> };
  heading_3?: { rich_text?: Array<{ plain_text?: string }> };
}

async function listBlockChildren(
  apiKey: string,
  blockId: string,
  apiVersion: string
): Promise<NotionBlock[]> {
  const results: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${NOTION_BASE}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) {
      url.searchParams.set("start_cursor", cursor);
    }

    const res = await notionFetch(
      url,
      { headers: notionHeaders(apiKey, apiVersion) },
      `listBlockChildren:${blockId}`
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Notion list blocks failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      results: NotionBlock[];
      has_more?: boolean;
      next_cursor?: string | null;
    };

    results.push(...data.results);
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

function getBlockPlainText(block: NotionBlock): string | null {
  for (const key of ["heading_1", "heading_2", "heading_3"] as const) {
    const part = block[key];
    if (part?.rich_text?.length) {
      return part.rich_text.map((item) => item.plain_text ?? "").join("");
    }
  }

  if (block.type === "child_page" && block.child_page?.title) {
    return block.child_page.title;
  }

  return null;
}

async function getPageTitle(
  apiKey: string,
  pageId: string,
  apiVersion: string
): Promise<string | null> {
  const res = await notionFetch(
    `${NOTION_BASE}/pages/${pageId}`,
    { headers: notionHeaders(apiKey, apiVersion) },
    `getPageTitle:${pageId}`
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion page lookup failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    properties?: {
      title?: {
        title?: Array<{ plain_text?: string }>;
      };
    };
  };

  return data.properties?.title?.title?.map((part) => part.plain_text ?? "").join("") || null;
}

async function findTargetPageForSection(
  apiKey: string,
  pageIds: string[],
  sectionTitle: string,
  apiVersion: string
): Promise<{ pageId: string; matchedBy: string }> {
  for (const pageId of pageIds) {
    const pageTitle = await getPageTitle(apiKey, pageId, apiVersion);
    if (pageTitle && titleMatches(sectionTitle, pageTitle)) {
      return { pageId, matchedBy: "page_title" };
    }

    const blocks = await listBlockChildren(apiKey, pageId, apiVersion);
    for (const block of blocks) {
      const text = getBlockPlainText(block);
      if (!text || !titleMatches(sectionTitle, text)) {
        continue;
      }

      if (block.type === "child_page") {
        return { pageId: block.id, matchedBy: "child_page" };
      }

      return { pageId, matchedBy: "heading" };
    }
  }

  const env = getEnv();
  return { pageId: env.NOTION_SPRINTS_PAGE_ID, matchedBy: "default" };
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function titleMatches(expectedTitle: string, actualTitle: string | null): boolean {
  if (!actualTitle) return false;

  const expected = normalizeTitle(expectedTitle);
  const actual = normalizeTitle(actualTitle);

  if (actual === expected) return true;
  if (actual.includes(expected) || expected.includes(actual)) return true;

  return (
    actual.includes("retell") &&
    actual.includes("session") &&
    (expected.includes("retell") || expected.includes("supabase"))
  );
}

export interface DiscoveredNotionDatabase {
  id: string;
  title: string;
  pageId: string;
}

async function collectDatabasesOnPage(
  apiKey: string,
  pageId: string,
  apiVersion: string,
  discovered: DiscoveredNotionDatabase[],
  visited: Set<string>,
  depth = 0,
  maxDepth = 4
): Promise<void> {
  if (visited.has(pageId) || depth > maxDepth) {
    return;
  }

  visited.add(pageId);

  const directTitle = await getDatabaseTitle(apiKey, pageId, apiVersion);
  if (directTitle) {
    discovered.push({ id: pageId, title: directTitle, pageId });
  }

  const blocks = await listBlockChildren(apiKey, pageId, apiVersion);

  for (const block of blocks) {
    if (block.type === "child_database") {
      const title = await getDatabaseTitle(apiKey, block.id, apiVersion);
      if (title) {
        discovered.push({ id: block.id, title, pageId });
      }
      continue;
    }

    if (block.type === "child_page") {
      await collectDatabasesOnPage(
        apiKey,
        block.id,
        apiVersion,
        discovered,
        visited,
        depth + 1,
        maxDepth
      );
      continue;
    }

    if (block.has_children) {
      const nestedBlocks = await listBlockChildren(apiKey, block.id, apiVersion);
      for (const nested of nestedBlocks) {
        if (nested.type === "child_database") {
          const title = await getDatabaseTitle(apiKey, nested.id, apiVersion);
          if (title) {
            discovered.push({ id: nested.id, title, pageId });
          }
        }
      }
    }
  }
}

export async function discoverNotionDatabases(): Promise<DiscoveredNotionDatabase[]> {
  const env = getEnv();
  const apiKey = await getNotionApiKey();
  const pageIds = env.NOTION_SEARCH_PAGE_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const discovered: DiscoveredNotionDatabase[] = [];
  const visited = new Set<string>();

  for (const pageId of pageIds) {
    await collectDatabasesOnPage(
      apiKey,
      pageId,
      env.NOTION_API_VERSION,
      discovered,
      visited
    );
  }

  const unique = new Map<string, DiscoveredNotionDatabase>();
  for (const item of discovered) {
    unique.set(item.id, item);
  }

  return [...unique.values()];
}

async function findDatabaseOnPages(
  apiKey: string,
  pageIds: string[],
  expectedTitle: string,
  apiVersion: string
): Promise<string | null> {
  const discovered: DiscoveredNotionDatabase[] = [];
  const visited = new Set<string>();

  for (const pageId of pageIds) {
    await collectDatabasesOnPage(apiKey, pageId, apiVersion, discovered, visited);
  }

  const exact = discovered.find((db) => titleMatches(expectedTitle, db.title));
  if (exact) {
    return exact.id;
  }

  const fuzzy = discovered.find((db) =>
    normalizeTitle(db.title).includes("retell") &&
    normalizeTitle(db.title).includes("session")
  );
  return fuzzy?.id ?? null;
}

async function createRetellSessionsDatabase(
  apiKey: string,
  parentPageId: string,
  title: string,
  apiVersion: string
): Promise<string> {
  const res = await notionFetch(
    `${NOTION_BASE}/databases`,
    {
      method: "POST",
      headers: notionHeaders(apiKey, apiVersion),
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        title: [{ type: "text", text: { content: title } }],
        properties: {
          "Session ID": { title: {} },
          "Call time": { date: {} },
          "Duration (s)": { number: {} },
          Status: { select: {} },
          Sentiment: { select: {} },
          Outcome: { select: {} },
          Contact: { rich_text: {} },
          Email: { email: {} },
          Phone: { phone_number: {} },
          Deal: { rich_text: {} },
          "Deal stage": { select: {} },
          Agent: { rich_text: {} },
          Direction: { select: {} },
          Cost: { number: {} },
          "Total price": { number: {} },
          Recording: { url: {} },
          "Retell log": { url: {} },
          call_transcript: { rich_text: {} },
          transcript_with_tool_calls: { rich_text: {} },
          "Supabase updated": { date: {} },
        },
      }),
    },
    "createRetellSessionsDatabase"
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion database create failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

async function findDatabaseOnPage(
  apiKey: string,
  pageId: string,
  expectedTitle: string,
  apiVersion: string
): Promise<string | null> {
  return findDatabaseOnPages(apiKey, [pageId], expectedTitle, apiVersion);
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
  const pageIds = env.NOTION_SEARCH_PAGE_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  let databaseId: string | null = null;
  let discoveryError: Error | null = null;

  try {
    databaseId = await findDatabaseOnPages(
      apiKey,
      pageIds,
      env.NOTION_DATABASE_TITLE,
      env.NOTION_API_VERSION
    );
  } catch (err) {
    discoveryError = err instanceof Error ? err : new Error(String(err));
    logger.warn("Notion database discovery failed", { message: discoveryError.message });
  }

  if (!databaseId && env.NOTION_AUTO_CREATE_DATABASE) {
    if (discoveryError) {
      throw new Error(
        `Could not discover Notion database "${env.NOTION_DATABASE_TITLE}" due to API error: ${discoveryError.message}. ` +
          "Set NOTION_RETELL_DATABASE_ID to skip discovery and avoid creating duplicate databases."
      );
    }

    const target = await findTargetPageForSection(
      apiKey,
      pageIds,
      env.NOTION_DATABASE_TITLE,
      env.NOTION_API_VERSION
    );

    databaseId = await createRetellSessionsDatabase(
      apiKey,
      target.pageId,
      env.NOTION_DATABASE_TITLE,
      env.NOTION_API_VERSION
    );

    logger.info("Created Notion database for retell_sessions sync", {
      databaseId,
      pageId: target.pageId,
      matchedBy: target.matchedBy,
      title: env.NOTION_DATABASE_TITLE,
    });
  }

  if (!databaseId) {
    const available = await discoverNotionDatabases();
    const availableList = available
      .map((db) => `${db.title} (${db.id})`)
      .join("; ");

    throw new Error(
      `Could not find Notion database "${env.NOTION_DATABASE_TITLE}" on pages ${pageIds.join(", ")}.` +
        (availableList ? ` Available databases: ${availableList}.` : " No databases found on those pages.") +
        " Share the pages with your integration, set NOTION_RETELL_DATABASE_ID, or NOTION_AUTO_CREATE_DATABASE=true."
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

export async function setupNotionDatabase(): Promise<{
  databaseId: string;
  created: boolean;
  pageId: string;
  matchedBy?: string;
}> {
  resetNotionDatabaseCache();

  const env = getEnv();
  const apiKey = await getNotionApiKey();
  const pageIds = env.NOTION_SEARCH_PAGE_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (env.NOTION_RETELL_DATABASE_ID) {
    cachedDatabaseId = env.NOTION_RETELL_DATABASE_ID;
    return {
      databaseId: env.NOTION_RETELL_DATABASE_ID,
      created: false,
      pageId: env.NOTION_SPRINTS_PAGE_ID,
      matchedBy: "env",
    };
  }

  const existingId = await findDatabaseOnPages(
    apiKey,
    pageIds,
    env.NOTION_DATABASE_TITLE,
    env.NOTION_API_VERSION
  );

  if (existingId) {
    cachedDatabaseId = existingId;
    return {
      databaseId: existingId,
      created: false,
      pageId: env.NOTION_SPRINTS_PAGE_ID,
      matchedBy: "existing",
    };
  }

  const target = await findTargetPageForSection(
    apiKey,
    pageIds,
    env.NOTION_DATABASE_TITLE,
    env.NOTION_API_VERSION
  );

  const databaseId = await createRetellSessionsDatabase(
    apiKey,
    target.pageId,
    env.NOTION_DATABASE_TITLE,
    env.NOTION_API_VERSION
  );

  cachedDatabaseId = databaseId;
  logger.info("Setup created Notion retell_sessions database", {
    databaseId,
    pageId: target.pageId,
    matchedBy: target.matchedBy,
  });

  return {
    databaseId,
    created: true,
    pageId: target.pageId,
    matchedBy: target.matchedBy,
  };
}

interface NotionPageRef {
  id: string;
}

async function queryRetellPages(
  apiKey: string,
  databaseId: string,
  body: Record<string, unknown>
): Promise<{ results: NotionPageRef[]; has_more: boolean; next_cursor: string | null }> {
  const res = await notionFetch(
    retellQueryUrl(databaseId),
    {
      method: "POST",
      headers: notionHeaders(apiKey, syncApiVersion()),
      body: JSON.stringify(body),
    },
    "queryRetellPages"
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion query failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    results?: NotionPageRef[];
    has_more?: boolean;
    next_cursor?: string | null;
  };

  return {
    results: data.results ?? [],
    has_more: Boolean(data.has_more),
    next_cursor: data.next_cursor ?? null,
  };
}

async function findNotionPagesBySessionId(
  sessionId: string,
  apiKey: string,
  databaseId: string,
  cache?: Map<string, string>
): Promise<string[]> {
  const cached = cache?.get(sessionId);
  if (cached) {
    return [cached];
  }

  const data = await queryRetellPages(apiKey, databaseId, {
    filter: {
      property: "Session ID",
      title: { equals: sessionId },
    },
    page_size: 10,
  });

  return data.results.map((page) => page.id);
}

async function archiveNotionPage(apiKey: string, pageId: string, sessionId: string): Promise<void> {
  const res = await notionFetch(
    `${NOTION_BASE}/pages/${pageId}`,
    {
      method: "PATCH",
      headers: notionHeaders(apiKey, syncApiVersion()),
      body: JSON.stringify({ archived: true }),
    },
    `archiveNotionPage:${pageId}`
  );

  if (!res.ok) {
    const body = await res.text();
    logger.warn("Could not archive duplicate Notion page", { sessionId, pageId, error: body });
    return;
  }

  logger.warn("Archived duplicate Notion page", { sessionId, pageId });
}

async function recordNotionSyncFailure(sessionId: string, error: string): Promise<void> {
  try {
    await upsertSyncError({
      syncName: NOTION_SYNC_NAME,
      sessionId,
      error,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to record Notion sync error", { sessionId, message });
  }
}

async function recordNotionSyncSuccess(sessionId: string): Promise<void> {
  try {
    await resolveSyncError(NOTION_SYNC_NAME, sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Failed to resolve Notion sync error", { sessionId, message });
  }
}

async function retellDatabaseId(): Promise<string> {
  const env = getEnv();
  if (env.NOTION_RETELL_DATA_SOURCE_ID) {
    return env.NOTION_RETELL_DATABASE_ID ?? env.NOTION_RETELL_DATA_SOURCE_ID;
  }
  return resolveNotionDatabaseId();
}

export async function syncRetellSessionToNotion(
  row: RetellSessionRow,
  options: { force?: boolean; cache?: Map<string, string> } = {}
): Promise<NotionSessionSyncResult> {
  const env = getEnv();
  if (!env.NOTION_SYNC_ENABLED && !options.force) {
    return { success: true, action: "skipped" };
  }

  if (!row.session_id?.trim()) {
    return { success: false, error: "session_id is required" };
  }

  try {
    const apiKey = await getNotionApiKey();
    const databaseId = await retellDatabaseId();
    const properties = mapRowToNotionProperties(row);
    const pageIds = await findNotionPagesBySessionId(
      row.session_id,
      apiKey,
      databaseId,
      options.cache
    );
    const [keeper, ...duplicates] = pageIds;

    for (const duplicateId of duplicates) {
      await archiveNotionPage(apiKey, duplicateId, row.session_id);
    }

    if (keeper) {
      const res = await notionFetch(
        `${NOTION_BASE}/pages/${keeper}`,
        {
          method: "PATCH",
          headers: notionHeaders(apiKey, syncApiVersion()),
          body: JSON.stringify({ properties }),
        },
        `updateNotionPage:${keeper}`
      );

      if (!res.ok) {
        const body = await res.text();
        const error = `Notion update failed (${res.status}): ${body}`;
        await recordNotionSyncFailure(row.session_id, error);
        return { success: false, error };
      }

      options.cache?.set(row.session_id, keeper);
      await recordNotionSyncSuccess(row.session_id);
      return { success: true, action: "updated", notionPageId: keeper };
    }

    const res = await notionFetch(
      `${NOTION_BASE}/pages`,
      {
        method: "POST",
        headers: notionHeaders(apiKey, syncApiVersion()),
        body: JSON.stringify({
          parent: retellPageParent(databaseId),
          properties,
        }),
      },
      `createNotionPage:${row.session_id}`
    );

    if (!res.ok) {
      const body = await res.text();
      const error = `Notion create failed (${res.status}): ${body}`;
      await recordNotionSyncFailure(row.session_id, error);
      return { success: false, error };
    }

    const created = (await res.json()) as { id: string };
    options.cache?.set(row.session_id, created.id);
    await recordNotionSyncSuccess(row.session_id);
    return { success: true, action: "created", notionPageId: created.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Notion sync failed", { sessionId: row.session_id, message });
    await recordNotionSyncFailure(row.session_id, message);
    cachedApiKey = null;
    return { success: false, error: message };
  }
}

interface NotionPropertyValue {
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  number?: number | null;
  select?: { name?: string } | null;
  date?: { start?: string | null } | null;
}

interface NotionAuditPage extends NotionPageRef {
  properties?: Record<string, NotionPropertyValue>;
}

function plainText(property: NotionPropertyValue | undefined): string {
  const parts = property?.title ?? property?.rich_text ?? [];
  return parts.map((part) => part.plain_text ?? "").join("");
}

export interface NotionSessionSnapshot {
  pageId: string;
  sessionId: string;
  callTime: string | null;
  cost: number | null;
  durationSeconds: number | null;
  outcome: string | null;
  sentiment: string | null;
  transcriptLength: number;
  toolTranscriptLength: number;
}

export async function listNotionSessionSnapshots(): Promise<NotionSessionSnapshot[]> {
  const apiKey = await getNotionApiKey();
  const databaseId = await retellDatabaseId();
  const snapshots: NotionSessionSnapshot[] = [];
  let cursor: string | undefined;

  do {
    const res = await notionFetch(
      retellQueryUrl(databaseId),
      {
        method: "POST",
        headers: notionHeaders(apiKey, syncApiVersion()),
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor,
          sorts: [{ property: "Call time", direction: "descending" }],
        }),
      },
      "listNotionSessionSnapshots"
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Notion query failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      results?: NotionAuditPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };

    for (const page of data.results ?? []) {
      const properties = page.properties ?? {};
      snapshots.push({
        pageId: page.id,
        sessionId: plainText(properties["Session ID"]),
        callTime: properties["Call time"]?.date?.start ?? null,
        cost: properties.Cost?.number ?? null,
        durationSeconds: properties["Duration (s)"]?.number ?? null,
        outcome: properties.Outcome?.select?.name ?? null,
        sentiment: properties.Sentiment?.select?.name ?? null,
        transcriptLength: plainText(properties.call_transcript).length,
        toolTranscriptLength: plainText(properties.transcript_with_tool_calls).length,
      });
    }

    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return snapshots;
}

export async function getNotionDatabaseInfo(): Promise<{
  success: boolean;
  databaseId?: string;
  dataSourceId?: string;
  title?: string;
  error?: string;
  availableDatabases?: DiscoveredNotionDatabase[];
}> {
  const env = getEnv();

  if (!(await getValidNotionAccessToken())) {
    return { success: false, error: "Notion is not connected. Open /auth/notion to authorize." };
  }

  try {
    const apiKey = await getNotionApiKey();
    if (env.NOTION_RETELL_DATA_SOURCE_ID) {
      const res = await notionFetch(
        `${NOTION_BASE}/data_sources/${env.NOTION_RETELL_DATA_SOURCE_ID}`,
        { headers: notionHeaders(apiKey, NOTION_DATA_SOURCE_VERSION) },
        "getDataSource"
      );
      if (!res.ok) {
        const body = await res.text();
        return {
          success: false,
          databaseId: env.NOTION_RETELL_DATABASE_ID,
          dataSourceId: env.NOTION_RETELL_DATA_SOURCE_ID,
          error: `Notion data source lookup failed (${res.status}): ${body}`,
        };
      }
      const data = (await res.json()) as { title?: Array<{ plain_text?: string }> };
      const title = data.title?.map((part) => part.plain_text ?? "").join("") || null;
      return {
        success: true,
        databaseId: env.NOTION_RETELL_DATABASE_ID,
        dataSourceId: env.NOTION_RETELL_DATA_SOURCE_ID,
        title: title ?? env.NOTION_DATABASE_TITLE,
      };
    }

    const databaseId = await resolveNotionDatabaseId();
    const title = await getDatabaseTitle(apiKey, databaseId, env.NOTION_API_VERSION);

    return {
      success: true,
      databaseId,
      title: title ?? env.NOTION_DATABASE_TITLE,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let availableDatabases: DiscoveredNotionDatabase[] = [];
    try {
      availableDatabases = await discoverNotionDatabases();
    } catch {
      availableDatabases = [];
    }

    return { success: false, error: message, availableDatabases };
  }
}

export function resetNotionDatabaseCache(): void {
  cachedDatabaseId = null;
}

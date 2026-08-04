import {
  RETELL_MCP_CONTEXT_FIELDS,
  RETELL_MCP_ENDPOINT,
  RETELL_MCP_SERVER_NAME,
  RETELL_MCP_TOOLS,
} from "../mcp/toolCatalog.js";
import { getEnv } from "./env.js";
import { logger } from "./logger.js";
import {
  refreshStoredNotionTokenIfNeeded,
  tryRefreshNotionAccessToken,
  verifyNotionAccessToken,
} from "./notionAuth.js";

const NOTION_BASE = "https://api.notion.com/v1";
export const MCP_TOOLS_DOC_MARKER = "ai-calling-mcp-tools-doc-v1";

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  heading_1?: { rich_text?: Array<{ plain_text?: string }> };
  heading_2?: { rich_text?: Array<{ plain_text?: string }> };
  heading_3?: { rich_text?: Array<{ plain_text?: string }> };
  paragraph?: { rich_text?: Array<{ plain_text?: string }> };
  callout?: { rich_text?: Array<{ plain_text?: string }> };
}

function notionHeaders(apiKey: string, apiVersion: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": apiVersion,
    "Content-Type": "application/json",
  };
}

function formatNotionId(id: string): string {
  const clean = id.replace(/-/g, "");
  if (clean.length !== 32) {
    return id;
  }

  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
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
    actual.includes("mcp") &&
    (actual.includes("tools implemented") || actual.includes("general tools"))
  );
}

function getBlockPlainText(block: NotionBlock): string | null {
  for (const key of ["heading_1", "heading_2", "heading_3", "paragraph"] as const) {
    const part = block[key];
    if (part?.rich_text?.length) {
      return part.rich_text.map((item) => item.plain_text ?? "").join("");
    }
  }

  const callout = block.callout;
  if (callout?.rich_text?.length) {
    return callout.rich_text.map((item) => item.plain_text ?? "").join("");
  }

  return null;
}

function headingLevel(block: NotionBlock): number | null {
  if (block.type === "heading_1") return 1;
  if (block.type === "heading_2") return 2;
  if (block.type === "heading_3") return 3;
  return null;
}

async function getNotionApiKey(): Promise<string> {
  const apiKey = await refreshStoredNotionTokenIfNeeded();
  if (!apiKey) {
    throw new Error("Notion is not connected. Open /auth/notion to authorize.");
  }

  const verification = await verifyNotionAccessToken(apiKey);
  if (!verification.valid) {
    const refreshed = await tryRefreshNotionAccessToken();
    if (refreshed) {
      return refreshed;
    }
    throw new Error(
      "Notion token is invalid. Re-authorize at /auth/notion and update NOTION_API_KEY and NOTION_REFRESH_TOKEN in Render."
    );
  }

  return apiKey;
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

    const res = await fetch(url, {
      headers: notionHeaders(apiKey, apiVersion),
    });

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

async function deleteBlock(apiKey: string, blockId: string, apiVersion: string): Promise<void> {
  const res = await fetch(`${NOTION_BASE}/blocks/${blockId}`, {
    method: "DELETE",
    headers: notionHeaders(apiKey, apiVersion),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion delete block failed (${res.status}): ${body}`);
  }
}

async function appendBlockChildren(
  apiKey: string,
  blockId: string,
  apiVersion: string,
  children: Array<Record<string, unknown>>,
  after?: string
): Promise<void> {
  const url = `${NOTION_BASE}/blocks/${blockId}/children`;
  const body: Record<string, unknown> = { children };
  if (after) {
    body.after = after;
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: notionHeaders(apiKey, apiVersion),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`Notion append blocks failed (${res.status}): ${responseBody}`);
  }
}

async function resolveSectionBlockId(
  apiKey: string,
  pageId: string,
  sectionTitle: string,
  configuredBlockId: string | undefined,
  apiVersion: string
): Promise<{ sectionBlockId: string; matchedBy: string }> {
  if (configuredBlockId) {
    return {
      sectionBlockId: formatNotionId(configuredBlockId),
      matchedBy: "env_block_id",
    };
  }

  const blocks = await listBlockChildren(apiKey, pageId, apiVersion);
  for (const block of blocks) {
    const text = getBlockPlainText(block);
    if (text && titleMatches(sectionTitle, text)) {
      return { sectionBlockId: block.id, matchedBy: "heading" };
    }
  }

  throw new Error(
    `Could not find Notion section "${sectionTitle}" on page ${pageId}. Set NOTION_MCP_TOOLS_SECTION_BLOCK_ID.`
  );
}

function buildDocBlocks(syncedAt: string): Array<Record<string, unknown>> {
  const deployUrl = "https://ai-calling-j1hu.onrender.com";

  const blocks: Array<Record<string, unknown>> = [
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { emoji: "🔄" },
        rich_text: [
          {
            type: "text",
            text: {
              content: `[${MCP_TOOLS_DOC_MARKER}] Auto-synced from ai-calling repo on ${syncedAt}. Source: src/mcp/tools.ts`,
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "Retell connects to this MCP server during live calls. Every tool invocation is logged to Supabase mcp_tool_calls (linked by session_id / call_id).",
            },
          },
        ],
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          { type: "text", text: { content: "MCP server: " } },
          {
            type: "text",
            text: { content: RETELL_MCP_SERVER_NAME },
            annotations: { bold: true, code: true },
          },
        ],
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          { type: "text", text: { content: "Endpoint: " } },
          {
            type: "text",
            text: { content: `${deployUrl}${RETELL_MCP_ENDPOINT.replace("POST ", "")}` },
            annotations: { code: true },
          },
          { type: "text", text: { content: " (Bearer MCP_SERVER_SECRET)" } },
        ],
      },
    },
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: "Retell context fields (all tools)" } }],
      },
    },
  ];

  for (const field of RETELL_MCP_CONTEXT_FIELDS) {
    blocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: field } }],
      },
    });
  }

  blocks.push({
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: [
        {
          type: "text",
          text: { content: `Implemented MCP tools (${RETELL_MCP_TOOLS.length})` },
        },
      ],
    },
  });

  for (const tool of RETELL_MCP_TOOLS) {
    blocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: tool.name },
            annotations: { bold: true, code: true },
          },
          { type: "text", text: { content: ` — ${tool.description} ` } },
          { type: "text", text: { content: "Retell: " }, annotations: { italic: true } },
          { type: "text", text: { content: `${tool.retellLink} ` } },
          { type: "text", text: { content: "Supabase: " }, annotations: { italic: true } },
          { type: "text", text: { content: tool.writesToSupabase } },
        ],
      },
    });
  }

  blocks.push({
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: [{ type: "text", text: { content: "Not synced to Notion yet" } }],
    },
  });

  blocks.push({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        {
          type: "text",
          text: {
            content:
              "Per-call MCP tool usage from mcp_tool_calls (tools used, last tool, booking attempted) — available in Supabase only today.",
          },
        },
      ],
    },
  });

  return blocks;
}

async function removeExistingDocBlocks(
  apiKey: string,
  pageId: string,
  sectionBlockId: string,
  apiVersion: string
): Promise<number> {
  const blocks = await listBlockChildren(apiKey, pageId, apiVersion);
  const sectionIndex = blocks.findIndex((block) => block.id === sectionBlockId);
  if (sectionIndex === -1) {
    return 0;
  }

  const sectionLevel = headingLevel(blocks[sectionIndex]) ?? 2;
  const afterSection = blocks.slice(sectionIndex + 1);

  let markerIndex = -1;
  for (let i = 0; i < afterSection.length; i += 1) {
    const text = getBlockPlainText(afterSection[i]);
    if (text?.includes(MCP_TOOLS_DOC_MARKER)) {
      markerIndex = i;
      break;
    }

    const level = headingLevel(afterSection[i]);
    if (level !== null && level <= sectionLevel) {
      break;
    }
  }

  if (markerIndex === -1) {
    return 0;
  }

  const toDelete: string[] = [];
  for (let i = markerIndex; i < afterSection.length; i += 1) {
    const block = afterSection[i];
    if (i > markerIndex) {
      const level = headingLevel(block);
      if (level !== null && level <= sectionLevel) {
        break;
      }
    }
    toDelete.push(block.id);
  }

  for (const blockId of toDelete) {
    await deleteBlock(apiKey, blockId, apiVersion);
  }

  return toDelete.length;
}

export interface SyncMcpToolsDocResult {
  success: boolean;
  pageId: string;
  sectionBlockId: string;
  matchedBy: string;
  removedBlocks: number;
  addedBlocks: number;
  syncedAt: string;
  error?: string;
}

export async function syncMcpToolsDocToNotion(): Promise<SyncMcpToolsDocResult> {
  const env = getEnv();
  const syncedAt = new Date().toISOString();

  if (!env.NOTION_SYNC_ENABLED) {
    return {
      success: false,
      pageId: env.NOTION_SPRINTS_PAGE_ID,
      sectionBlockId: "",
      matchedBy: "",
      removedBlocks: 0,
      addedBlocks: 0,
      syncedAt,
      error: "NOTION_SYNC_ENABLED is false",
    };
  }

  try {
    const apiKey = await getNotionApiKey();
    const pageId = env.NOTION_SPRINTS_PAGE_ID;
    const { sectionBlockId, matchedBy } = await resolveSectionBlockId(
      apiKey,
      pageId,
      env.NOTION_MCP_TOOLS_SECTION_TITLE,
      env.NOTION_MCP_TOOLS_SECTION_BLOCK_ID,
      env.NOTION_API_VERSION
    );

    const removedBlocks = await removeExistingDocBlocks(
      apiKey,
      pageId,
      sectionBlockId,
      env.NOTION_API_VERSION
    );

    const docBlocks = buildDocBlocks(syncedAt);
    await appendBlockChildren(
      apiKey,
      pageId,
      env.NOTION_API_VERSION,
      docBlocks,
      sectionBlockId
    );

    logger.info("Synced MCP tools doc to Notion", {
      pageId,
      sectionBlockId,
      matchedBy,
      removedBlocks,
      addedBlocks: docBlocks.length,
    });

    return {
      success: true,
      pageId,
      sectionBlockId,
      matchedBy,
      removedBlocks,
      addedBlocks: docBlocks.length,
      syncedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion MCP tools doc sync failed", { message });
    return {
      success: false,
      pageId: env.NOTION_SPRINTS_PAGE_ID,
      sectionBlockId: "",
      matchedBy: "",
      removedBlocks: 0,
      addedBlocks: 0,
      syncedAt,
      error: message,
    };
  }
}

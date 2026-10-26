import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv, resetEnvCache } from "./env.js";
import { logger } from "./logger.js";
import { getSyncState, upsertSyncState } from "./supabase.js";

/** Supabase sync_state row — survives Render redeploys when Render env tokens are stale. */
export const NOTION_OAUTH_SYNC_STATE_NAME = "notion_oauth";

const NOTION_OAUTH_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_OAUTH_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API_BASE = "https://api.notion.com/v1";

export interface NotionOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  bot_id: string;
  duplicated_template_id?: string | null;
  owner?: Record<string, unknown>;
  workspace_icon?: string | null;
  workspace_id: string;
  workspace_name?: string | null;
}

export interface NotionConnectionStatus {
  connected: boolean;
  needsReauth?: boolean;
  source?: "oauth_env" | "oauth_memory" | "oauth_supabase" | "oauth_refreshed" | "internal";
  workspaceId?: string;
  workspaceName?: string | null;
  botId?: string;
  error?: string;
  persistedToSupabase?: boolean;
}

let memoryOAuthToken: NotionOAuthTokenResponse | null = null;
let refreshTokenInvalid = false;

function requireOAuthClientConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const env = getEnv();
  if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
    throw new Error("NOTION_CLIENT_ID and NOTION_CLIENT_SECRET are required for OAuth");
  }
  return {
    clientId: env.NOTION_CLIENT_ID,
    clientSecret: env.NOTION_CLIENT_SECRET,
    redirectUri: env.NOTION_REDIRECT_URI,
  };
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function buildNotionAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = requireOAuthClientConfig();
  const url = new URL(NOTION_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", state);
  return url.toString();
}

export function createOAuthState(): string {
  const nonce = randomBytes(16).toString("hex");
  const env = getEnv();
  const signature = createHmac("sha256", env.MCP_SERVER_SECRET)
    .update(nonce)
    .digest("hex");
  return `${nonce}.${signature}`;
}

export function verifyOAuthState(state: string | undefined): boolean {
  if (!state) {
    return true;
  }

  const [nonce, signature] = state.split(".");
  if (!nonce || !signature) {
    return false;
  }

  const env = getEnv();
  const expected = createHmac("sha256", env.MCP_SERVER_SECRET)
    .update(nonce)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function postOAuthToken(body: Record<string, string>): Promise<NotionOAuthTokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireOAuthClientConfig();
  const payload = { ...body };
  if (body.grant_type === "authorization_code") {
    payload.redirect_uri = redirectUri;
  }

  const res = await fetch(NOTION_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(clientId, clientSecret),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Notion OAuth token exchange failed (${res.status}): ${text}`);
  }

  return JSON.parse(text) as NotionOAuthTokenResponse;
}

export async function exchangeNotionAuthorizationCode(
  code: string
): Promise<NotionOAuthTokenResponse> {
  return postOAuthToken({
    grant_type: "authorization_code",
    code,
  });
}

export async function refreshNotionAccessToken(
  refreshToken: string
): Promise<NotionOAuthTokenResponse> {
  return postOAuthToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export function rememberOAuthToken(token: NotionOAuthTokenResponse): void {
  memoryOAuthToken = token;
  refreshTokenInvalid = false;
}

export async function persistNotionOAuthTokens(
  token: NotionOAuthTokenResponse
): Promise<boolean> {
  rememberOAuthToken(token);
  applyOAuthTokenToProcessEnv(token);

  try {
    await upsertSyncState({
      name: NOTION_OAUTH_SYNC_STATE_NAME,
      meta: {
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        workspace_id: token.workspace_id,
        workspace_name: token.workspace_name ?? null,
        bot_id: token.bot_id,
        updated_via: "oauth",
        saved_at: new Date().toISOString(),
      },
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Could not persist Notion OAuth tokens to Supabase", { message });
    return false;
  }
}

async function readPersistedOAuthTokens(): Promise<{
  accessToken?: string;
  refreshToken?: string;
}> {
  try {
    const stored = await getSyncState(NOTION_OAUTH_SYNC_STATE_NAME);
    const accessToken =
      typeof stored?.meta?.access_token === "string" ? stored.meta.access_token : undefined;
    const refreshToken =
      typeof stored?.meta?.refresh_token === "string" ? stored.meta.refresh_token : undefined;
    return { accessToken, refreshToken };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Could not read Notion OAuth tokens from Supabase", { message });
    return {};
  }
}

function uniqueTokens(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export type NotionAccessTokenSource =
  | "oauth_env"
  | "oauth_memory"
  | "oauth_supabase"
  | "internal"
  | "oauth_refreshed";

/**
 * Returns a verified Notion access token, refreshing and persisting to Supabase when needed.
 */
export async function getValidNotionAccessToken(): Promise<{
  accessToken: string;
  source: NotionAccessTokenSource;
} | null> {
  const env = getEnv();
  const persisted = await readPersistedOAuthTokens();

  const accessCandidates = uniqueTokens([
    env.NOTION_API_KEY,
    persisted.accessToken,
    memoryOAuthToken?.access_token,
  ]);

  for (const candidate of accessCandidates) {
    const verification = await verifyNotionAccessToken(candidate);
    if (verification.valid) {
      const source: NotionAccessTokenSource =
        candidate === env.NOTION_API_KEY
          ? env.NOTION_REFRESH_TOKEN
            ? "oauth_env"
            : "internal"
          : candidate === persisted.accessToken
            ? "oauth_supabase"
            : "oauth_memory";
      return { accessToken: candidate, source };
    }
  }

  const refreshCandidates = uniqueTokens([
    persisted.refreshToken,
    env.NOTION_REFRESH_TOKEN,
    memoryOAuthToken?.refresh_token,
  ]);

  if (refreshTokenInvalid || refreshCandidates.length === 0) {
    return null;
  }

  if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
    return null;
  }

  for (const refreshToken of refreshCandidates) {
    try {
      const refreshed = await refreshNotionAccessToken(refreshToken);
      await persistNotionOAuthTokens(refreshed);
      logger.info("Notion OAuth token refreshed", {
        workspaceId: refreshed.workspace_id,
        botId: refreshed.bot_id,
      });
      return { accessToken: refreshed.access_token, source: "oauth_refreshed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("invalid_grant") || message.includes("Invalid refresh token")) {
        refreshTokenInvalid = true;
        logger.error("Notion refresh token is invalid; re-authorize at /auth/notion", {
          message,
        });
        return null;
      }
      logger.warn("Notion token refresh attempt failed", { message });
    }
  }

  return null;
}

export function getRememberedOAuthToken(): NotionOAuthTokenResponse | null {
  return memoryOAuthToken;
}

export async function verifyNotionAccessToken(
  accessToken: string
): Promise<{ valid: boolean; error?: string }> {
  const env = getEnv();
  const res = await fetch(`${NOTION_API_BASE}/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": env.NOTION_API_VERSION,
    },
  });

  if (res.ok) {
    return { valid: true };
  }

  const body = await res.text();
  return { valid: false, error: `Notion token verify failed (${res.status}): ${body}` };
}

export async function getNotionConnectionStatus(): Promise<NotionConnectionStatus> {
  const resolved = await getValidNotionAccessToken();

  if (!resolved) {
    return {
      connected: false,
      needsReauth: true,
      error: refreshTokenInvalid
        ? "Notion refresh token is invalid. Re-authorize at /auth/notion."
        : "No Notion token configured. Open /auth/notion to authorize.",
    };
  }

  let persistedToSupabase = false;
  try {
    const stored = await getSyncState(NOTION_OAUTH_SYNC_STATE_NAME);
    persistedToSupabase =
      typeof stored?.meta?.access_token === "string" &&
      stored.meta.access_token === resolved.accessToken;
  } catch {
    persistedToSupabase = false;
  }

  const storedMeta = memoryOAuthToken;
  return {
    connected: true,
    source: resolved.source,
    workspaceId: storedMeta?.workspace_id,
    workspaceName: storedMeta?.workspace_name,
    botId: storedMeta?.bot_id,
    persistedToSupabase,
  };
}

export async function resolveNotionAccessToken(): Promise<string | null> {
  const env = getEnv();

  if (env.NOTION_API_KEY) {
    return env.NOTION_API_KEY;
  }

  if (memoryOAuthToken?.access_token) {
    return memoryOAuthToken.access_token;
  }

  return null;
}

export async function tryRefreshNotionAccessToken(): Promise<string | null> {
  const resolved = await getValidNotionAccessToken();
  return resolved?.accessToken ?? null;
}

export async function refreshStoredNotionTokenIfNeeded(): Promise<string | null> {
  const resolved = await getValidNotionAccessToken();
  return resolved?.accessToken ?? null;
}

export function applyOAuthTokenToProcessEnv(token: NotionOAuthTokenResponse): void {
  process.env.NOTION_API_KEY = token.access_token;
  if (token.refresh_token) {
    process.env.NOTION_REFRESH_TOKEN = token.refresh_token;
  }
  resetEnvCache();
}

export function getNotionReauthUrl(): string {
  return "/auth/notion";
}

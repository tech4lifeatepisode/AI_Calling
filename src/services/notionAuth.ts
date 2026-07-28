import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv, resetEnvCache } from "./env.js";
import { logger } from "./logger.js";

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
  source?: "oauth_env" | "oauth_memory" | "internal";
  workspaceId?: string;
  workspaceName?: string | null;
  botId?: string;
  error?: string;
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
  const env = getEnv();
  const accessToken = await resolveNotionAccessToken();

  if (!accessToken) {
    return {
      connected: false,
      needsReauth: true,
      error: "No Notion token configured. Open /auth/notion to authorize.",
    };
  }

  const verification = await verifyNotionAccessToken(accessToken);
  if (!verification.valid) {
    return {
      connected: false,
      needsReauth: true,
      source: env.NOTION_REFRESH_TOKEN ? "oauth_env" : "internal",
      error: refreshTokenInvalid
        ? "Notion refresh token is invalid. Re-authorize at /auth/notion and update Render env vars."
        : verification.error,
    };
  }

  return {
    connected: true,
    source:
      memoryOAuthToken?.access_token === accessToken
        ? "oauth_memory"
        : env.NOTION_REFRESH_TOKEN
          ? "oauth_env"
          : "internal",
    workspaceId: memoryOAuthToken?.workspace_id,
    workspaceName: memoryOAuthToken?.workspace_name,
    botId: memoryOAuthToken?.bot_id,
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
  const env = getEnv();
  const refreshToken = env.NOTION_REFRESH_TOKEN ?? memoryOAuthToken?.refresh_token ?? null;

  if (refreshTokenInvalid || !refreshToken || !env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
    return null;
  }

  try {
    const refreshed = await refreshNotionAccessToken(refreshToken);
    rememberOAuthToken(refreshed);
    applyOAuthTokenToProcessEnv(refreshed);
    logger.info("Notion OAuth token refreshed", {
      workspaceId: refreshed.workspace_id,
      botId: refreshed.bot_id,
    });
    return refreshed.access_token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("invalid_grant") || message.includes("Invalid refresh token")) {
      refreshTokenInvalid = true;
      logger.error("Notion refresh token is invalid; re-authorize at /auth/notion", { message });
      return null;
    }

    logger.warn("Notion token refresh failed", { message });
    return null;
  }
}

export async function refreshStoredNotionTokenIfNeeded(): Promise<string | null> {
  return resolveNotionAccessToken();
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

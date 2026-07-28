import type { Request, Response } from "express";
import {
  applyOAuthTokenToProcessEnv,
  buildNotionAuthorizeUrl,
  createOAuthState,
  exchangeNotionAuthorizationCode,
  getNotionConnectionStatus,
  rememberOAuthToken,
  verifyOAuthState,
} from "../services/notionAuth.js";
import { getNotionDatabaseInfo, resetNotionDatabaseCache } from "../services/notion.js";
import { getEnv } from "../services/env.js";
import { logger } from "../services/logger.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; line-height: 1.5; color: #1f2937; }
    h1 { font-size: 1.75rem; }
    .ok { color: #047857; }
    .warn { color: #b45309; }
    .err { color: #b91c1c; }
    code, pre { background: #f3f4f6; border-radius: 6px; }
    code { padding: 2px 6px; }
    pre { padding: 12px; overflow-x: auto; }
    a.button { display: inline-block; background: #111827; color: white; text-decoration: none; padding: 10px 16px; border-radius: 8px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

export async function notionHomeHandler(_req: Request, res: Response): Promise<void> {
  const env = getEnv();
  const status = await getNotionConnectionStatus();
  const database = env.NOTION_SYNC_ENABLED ? await getNotionDatabaseInfo() : null;

  res.type("html").send(
    renderPage(
      "Notion — AI Calling Sync",
      `
        <p>Redirect URI: <code>${escapeHtml(env.NOTION_REDIRECT_URI)}</code></p>
        ${
          status.connected
            ? `<p class="ok">Connected via <strong>${escapeHtml(status.source ?? "unknown")}</strong>${
                status.workspaceName ? ` — ${escapeHtml(status.workspaceName)}` : ""
              }</p>`
            : `<p class="warn">Not connected yet.</p>`
        }
        ${
          database?.success
            ? `<p class="ok">Database: <strong>${escapeHtml(database.title ?? env.NOTION_DATABASE_TITLE)}</strong></p>`
            : database
              ? `<p class="warn">${escapeHtml(database.error ?? "Database not reachable")}</p>`
              : ""
        }
        <p><a class="button" href="/auth/notion">Connect to Notion</a></p>
        <p>After connecting, copy the tokens into Render env vars so they survive redeploys.</p>
      `
    )
  );
}

export function notionAuthorizeHandler(_req: Request, res: Response): void {
  try {
    const state = createOAuthState();
    res.redirect(buildNotionAuthorizeUrl(state));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion authorize redirect failed", { message });
    res.status(500).type("html").send(
      renderPage("Notion OAuth Error", `<p class="err">${escapeHtml(message)}</p>`)
    );
  }
}

export async function notionCallbackHandler(req: Request, res: Response): Promise<void> {
  const error = typeof req.query.error === "string" ? req.query.error : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const code = typeof req.query.code === "string" ? req.query.code : undefined;

  if (error) {
    res.status(400).type("html").send(
      renderPage(
        "Notion Authorization Denied",
        `<p class="warn">Authorization denied: <code>${escapeHtml(error)}</code></p>`
      )
    );
    return;
  }

  if (!verifyOAuthState(state)) {
    res.status(400).type("html").send(
      renderPage(
        "Invalid OAuth State",
        `<p class="err">OAuth state validation failed. Start again from <a href="/auth/notion">/auth/notion</a>.</p>`
      )
    );
    return;
  }

  if (!code) {
    res.status(400).type("html").send(
      renderPage("Missing Authorization Code", `<p class="err">No <code>code</code> was returned by Notion.</p>`)
    );
    return;
  }

  try {
    const token = await exchangeNotionAuthorizationCode(code);
    rememberOAuthToken(token);
    applyOAuthTokenToProcessEnv(token);
    resetNotionDatabaseCache();

    logger.info("Notion OAuth connected", {
      workspaceId: token.workspace_id,
      workspaceName: token.workspace_name,
      botId: token.bot_id,
    });

    res.type("html").send(
      renderPage(
        "Notion Connected",
        `
          <p class="ok">Connected to <strong>${escapeHtml(token.workspace_name ?? token.workspace_id)}</strong>.</p>
          <p>Sync is active for this running instance. To keep it working after redeploys, add these in Render:</p>
          <pre>NOTION_API_KEY=${escapeHtml(token.access_token)}${
            token.refresh_token
              ? `\nNOTION_REFRESH_TOKEN=${escapeHtml(token.refresh_token)}`
              : ""
          }</pre>
          <p>Also ensure <code>NOTION_CLIENT_ID</code> and <code>NOTION_CLIENT_SECRET</code> stay set for token refresh.</p>
          <p><a class="button" href="/notion/status">Check sync status</a></p>
        `
      )
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Notion OAuth callback failed", { message });
    res.status(500).type("html").send(
      renderPage(
        "Notion OAuth Failed",
        `
          <p class="err">${escapeHtml(message)}</p>
          <p class="warn">Authorization codes expire quickly and can only be used once. Start again:</p>
          <p><a class="button" href="/auth/notion">Connect to Notion again</a></p>
        `
      )
    );
  }
}

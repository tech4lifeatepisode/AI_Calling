import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "./services/auth.js";
import { healthHandler } from "./routes/health.js";
import { retellWebhookHandler } from "./routes/retellWebhook.js";
import { syncCallDataHandler } from "./routes/syncCallData.js";
import { sanitizeMcpRequestBody } from "./mcp/sanitizeToolInput.js";
import { createMcpServer } from "./mcp/tools.js";
import { logger } from "./services/logger.js";

function setMcpResponseHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-transform");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  setMcpResponseHeaders(res);

  // Retell executes tools during live calls without persisting MCP session IDs.
  // Use stateless Streamable HTTP: one fresh transport per request, JSON responses.
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const body = sanitizeMcpRequestBody(req.body);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("MCP POST error", { message });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.request(req.method, req.path, res.statusCode, Date.now() - startedAt);
    });
    next();
  });

  app.get("/health", healthHandler);

  app.post("/webhooks/retell", requireBearerAuth, (req, res) => {
    void retellWebhookHandler(req, res);
  });

  app.post("/cron/sync-call-data", requireBearerAuth, (req, res) => {
    void syncCallDataHandler(req, res);
  });

  app.post("/mcp", requireBearerAuth, (req, res) => {
    void handleMcpPost(req, res);
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error", { message: err.message });
    res.status(500).json({ error: err.message });
  });

  return app;
}

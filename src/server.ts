import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "./services/auth.js";
import { healthHandler } from "./routes/health.js";
import { retellWebhookHandler } from "./routes/retellWebhook.js";
import { createMcpServer } from "./mcp/tools.js";
import { logger } from "./services/logger.js";

export function createApp(): Express {
  const app = express();

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

  app.post("/mcp", requireBearerAuth, async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("MCP request error", { message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
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

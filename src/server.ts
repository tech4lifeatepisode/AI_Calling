import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { requireBearerAuth } from "./services/auth.js";
import { healthHandler } from "./routes/health.js";
import { retellWebhookHandler } from "./routes/retellWebhook.js";
import { createMcpServer } from "./mcp/tools.js";
import { logger } from "./services/logger.js";

function isMcpInitializeRequest(body: unknown): boolean {
  if (Array.isArray(body)) {
    return body.some((message) => isInitializeRequest(message));
  }
  return isInitializeRequest(body);
}

const mcpTransports = new Map<string, StreamableHTTPServerTransport>();

function setMcpResponseHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-transform");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  setMcpResponseHeaders(res);

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && mcpTransports.has(sessionId)) {
      transport = mcpTransports.get(sessionId)!;
    } else if (!sessionId && isMcpInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          mcpTransports.set(newSessionId, transport);
          logger.info("MCP session initialized", { sessionId: newSessionId });
        },
      });

      transport.onclose = () => {
        const closedSessionId = transport.sessionId;
        if (closedSessionId && mcpTransports.has(closedSessionId)) {
          mcpTransports.delete(closedSessionId);
          logger.info("MCP session closed", { sessionId: closedSessionId });
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Invalid or missing MCP session ID",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("MCP POST error", { message, sessionId });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

async function handleMcpGet(req: Request, res: Response): Promise<void> {
  setMcpResponseHeaders(res);

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !mcpTransports.has(sessionId)) {
    res.status(400).send("Invalid or missing MCP session ID");
    return;
  }

  try {
    const transport = mcpTransports.get(sessionId)!;
    await transport.handleRequest(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("MCP GET error", { message, sessionId });
    if (!res.headersSent) {
      res.status(500).send("MCP stream error");
    }
  }
}

async function handleMcpDelete(req: Request, res: Response): Promise<void> {
  setMcpResponseHeaders(res);

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !mcpTransports.has(sessionId)) {
    res.status(400).send("Invalid or missing MCP session ID");
    return;
  }

  try {
    const transport = mcpTransports.get(sessionId)!;
    await transport.handleRequest(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("MCP DELETE error", { message, sessionId });
    if (!res.headersSent) {
      res.status(500).send("MCP session termination error");
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

  app.post("/mcp", requireBearerAuth, (req, res) => {
    void handleMcpPost(req, res);
  });

  app.get("/mcp", requireBearerAuth, (req, res) => {
    void handleMcpGet(req, res);
  });

  app.delete("/mcp", requireBearerAuth, (req, res) => {
    void handleMcpDelete(req, res);
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

import type { Request, Response, NextFunction } from "express";
import { getEnv } from "./env.js";
import { verifyRetellSignature } from "./retellSignature.js";

export interface RequestWithRawBody extends Request {
  rawBody?: string;
}

export function captureRawBody(
  req: RequestWithRawBody,
  _res: Response,
  buf: Buffer
): void {
  req.rawBody = buf.toString("utf-8");
}

export function requireRetellOrBearerAuth(
  req: RequestWithRawBody,
  res: Response,
  next: NextFunction
): void {
  const signature = req.headers["x-retell-signature"] as string | undefined;
  const env = getEnv();

  if (signature && env.RETELL_API_KEY) {
    const rawBody = req.rawBody ?? "";
    if (verifyRetellSignature(rawBody, env.RETELL_API_KEY, signature)) {
      next();
      return;
    }
    res.status(401).json({ error: "Invalid Retell signature" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token === env.MCP_SERVER_SECRET) {
      next();
      return;
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}

export interface RetellCustomFunctionPayload {
  name?: string;
  call?: {
    call_id?: string;
    metadata?: Record<string, unknown>;
  };
  args?: Record<string, unknown>;
}

export function parseRetellPayload(body: unknown): {
  args: Record<string, unknown>;
  sessionId?: string;
  hubspotDealId?: string;
  hubspotContactId?: string;
} {
  const payload = (body ?? {}) as RetellCustomFunctionPayload;
  const args = payload.args ?? (body as Record<string, unknown>) ?? {};
  const metadata = payload.call?.metadata ?? {};

  const sessionId =
    payload.call?.call_id ??
    (args.sessionId as string | undefined) ??
    (metadata.sessionId as string | undefined);

  const hubspotDealId =
    (args.hubspotDealId as string | undefined) ??
    (metadata.hubspot_deal_id as string | undefined) ??
    (metadata.hubspotDealId as string | undefined);

  const hubspotContactId =
    (args.hubspotContactId as string | undefined) ??
    (metadata.hubspot_contact_id as string | undefined) ??
    (metadata.hubspotContactId as string | undefined);

  return { args, sessionId, hubspotDealId, hubspotContactId };
}

import type { Request, Response, NextFunction } from "express";
import { getEnv } from "./env.js";

export function requireBearerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const expected = getEnv().MCP_SERVER_SECRET;

  if (token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

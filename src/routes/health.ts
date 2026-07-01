import type { Request, Response } from "express";
import { getServiceName } from "../services/logger.js";

export function healthHandler(_req: Request, res: Response): void {
  res.json({
    ok: true,
    service: getServiceName(),
    time: new Date().toISOString(),
  });
}

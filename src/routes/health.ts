import type { Request, Response } from "express";
import { checkEpisodeBackendHealth } from "../services/episodeBookingClient.js";
import { getEnv } from "../services/env.js";
import { getServiceName } from "../services/logger.js";

const MCP_TOOLS = [
  "get_tour_availability",
  "book_tour",
  "log_retell_session",
  "log_tour_preference",
  "list_selectable_room_types",
  "check_room_availability",
  "get_room_pricing",
];

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const env = getEnv();
  const episodeBackend = await checkEpisodeBackendHealth();

  res.json({
    ok: true,
    service: getServiceName(),
    syncVersion: "20260701-failed-dial-sync",
    time: new Date().toISOString(),
    episodeBackend,
    tools: MCP_TOOLS,
  });
}

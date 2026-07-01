import dotenv from "dotenv";
import {
  insertToolCallLog,
  insertTourBooking,
  upsertRetellSession,
} from "../src/services/supabase.js";
import { logger } from "../src/services/logger.js";

dotenv.config();

async function main(): Promise<void> {
  const sessionId = `test-session-${Date.now()}`;

  logger.info("Upserting test Retell session", { sessionId });
  const sessionResult = await upsertRetellSession({
    session_id: sessionId,
    session_status: "completed",
    agent_name: "Cara",
    direction: "outbound",
    raw_payload: { source: "testSupabaseInsert" },
  });
  logger.info("Session upsert result", sessionResult);

  logger.info("Inserting test MCP tool call");
  const toolResult = await insertToolCallLog({
    session_id: sessionId,
    tool_name: "get_tour_availability",
    status: "success",
    request_payload: { tourType: "virtual" },
    response_payload: { success: true },
    latency_ms: 42,
  });
  logger.info("Tool call insert result", toolResult);

  logger.info("Inserting test tour booking preference");
  const bookingResult = await insertTourBooking({
    session_id: sessionId,
    tour_type: "virtual",
    booking_status: "interested",
    guest_email: "test@example.com",
  });
  logger.info("Tour booking insert result", bookingResult);
}

main().catch((err) => {
  logger.error("testSupabaseInsert failed", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

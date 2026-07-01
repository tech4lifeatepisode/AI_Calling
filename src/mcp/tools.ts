import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  bookTourInputSchema,
  getTourAvailabilityInputSchema,
  logRetellSessionInputSchema,
  logTourPreferenceInputSchema,
} from "./schemas.js";
import {
  bookTour,
  buildDealUpdateProperties,
  filterSlotsByPreference,
  formatDisplayTimeMadrid,
  getMeetingUrl,
  getTourAvailability,
  updateHubspotDeal,
} from "../services/hubspot.js";
import { insertToolCallLog, insertTourBooking, upsertRetellSession } from "../services/supabase.js";
import {
  logRetellSessionInputToPayload,
  normalizeRetellSession,
} from "../types/retell.js";
import { getEnv } from "../services/env.js";

function opt(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

async function logToolCall(params: {
  toolName: string;
  sessionId?: string | null;
  status: string;
  request: unknown;
  response: unknown;
  errorMessage?: string;
  startedAt: number;
}): Promise<void> {
  await insertToolCallLog({
    session_id: params.sessionId ?? null,
    tool_name: params.toolName,
    status: params.status,
    request_payload: params.request as Record<string, unknown>,
    response_payload: params.response as Record<string, unknown>,
    error_message: params.errorMessage ?? null,
    latency_ms: Date.now() - params.startedAt,
  });
}

function jsonResult(data: Record<string, unknown>) {
  // Keep payloads small and JSON-native for Retell MCP parsing.
  const { debugRawHubSpotResponse: _debug, ...safeData } = data;

  return {
    content: [{ type: "text" as const, text: JSON.stringify(safeData) }],
    structuredContent: safeData,
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "episode-retell-hubspot-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "get_tour_availability",
    {
      description: "Checks HubSpot availability for either a virtual or in-person tour.",
      inputSchema: getTourAvailabilityInputSchema.shape,
    },
    async (input) => {
      const startedAt = Date.now();
      const parsed = getTourAvailabilityInputSchema.parse(input);

      try {
        const { slots, rawResponse } = await getTourAvailability({
          tourType: parsed.tourType,
          timezone: parsed.timezone,
          monthOffset: parsed.monthOffset,
        });

        const filtered = filterSlotsByPreference(
          slots,
          parsed.preferredDay ?? undefined,
          parsed.preferredTime ?? undefined,
          5
        );

        const timezone = parsed.timezone ?? getEnv().DEFAULT_TIMEZONE;
        const availableSlots = filtered.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          durationMinutes: slot.durationMinutes,
          displayTimeMadrid: formatDisplayTimeMadrid(slot.startTime),
        }));

        const response = {
          success: true,
          tourType: parsed.tourType,
          timezone,
          availableSlots,
          messageForAgent:
            availableSlots.length > 0
              ? `Found ${availableSlots.length} available ${parsed.tourType === "virtual" ? "virtual" : "in-person"} tour slot(s). Offer one or two to the guest.`
              : "No available tour slots were found for the requested period. Offer to send tour links by WhatsApp instead.",
        };

        await logToolCall({
          toolName: "get_tour_availability",
          sessionId: parsed.sessionId ?? undefined,
          status: "success",
          request: parsed,
          response: {
            ...response,
            debugRawHubSpotResponse: availableSlots.length === 0 ? rawResponse : undefined,
          },
          startedAt,
        });

        return jsonResult(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const response = {
          success: false,
          tourType: parsed.tourType,
          timezone: parsed.timezone ?? getEnv().DEFAULT_TIMEZONE,
          availableSlots: [],
          messageForAgent:
            "I couldn't check availability right now. Offer to send tour links by WhatsApp instead.",
          error: message,
        };

        await logToolCall({
          toolName: "get_tour_availability",
          sessionId: parsed.sessionId ?? undefined,
          status: "error",
          request: parsed,
          response,
          errorMessage: message,
          startedAt,
        });

        return jsonResult(response);
      }
    }
  );

  server.registerTool(
    "book_tour",
    {
      description:
        "Books a HubSpot tour after the guest explicitly confirms the selected slot.",
      inputSchema: bookTourInputSchema.shape,
    },
    async (input) => {
      const startedAt = Date.now();
      const parsed = bookTourInputSchema.parse(input);

      if (!parsed.email) {
        const response = {
          success: false,
          messageForAgent: "Email is required to book a tour.",
          fallbackMessageForAgent:
            "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you.",
        };
        await logToolCall({
          toolName: "book_tour",
          sessionId: opt(parsed.sessionId),
          status: "error",
          request: parsed,
          response,
          errorMessage: "Missing email",
          startedAt,
        });
        return jsonResult(response);
      }

      if (!parsed.startTime) {
        const response = {
          success: false,
          messageForAgent: "A start time is required to book a tour.",
          fallbackMessageForAgent:
            "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you.",
        };
        await logToolCall({
          toolName: "book_tour",
          sessionId: opt(parsed.sessionId),
          status: "error",
          request: parsed,
          response,
          errorMessage: "Missing startTime",
          startedAt,
        });
        return jsonResult(response);
      }

      try {
        const env = getEnv();
        const slug =
          parsed.tourType === "virtual"
            ? env.HUBSPOT_VIRTUAL_SLUG
            : env.HUBSPOT_IN_PERSON_SLUG;
        const meetingUrl = getMeetingUrl(parsed.tourType);

        const bookingResult = await bookTour({
          tourType: parsed.tourType,
          startTime: parsed.startTime,
          durationMinutes: parsed.durationMinutes,
          timezone: parsed.timezone,
          email: parsed.email,
          firstName: opt(parsed.firstName),
          lastName: opt(parsed.lastName),
          phone: opt(parsed.phone),
          hubspotContactId: opt(parsed.hubspotContactId),
          hubspotDealId: opt(parsed.hubspotDealId),
          sessionId: opt(parsed.sessionId),
        });

        const bookingStatus = bookingResult.success ? "booked" : "failed";

        await insertTourBooking({
          session_id: opt(parsed.sessionId) ?? null,
          hubspot_contact_id: bookingResult.success
            ? bookingResult.contactId ?? opt(parsed.hubspotContactId) ?? null
            : opt(parsed.hubspotContactId) ?? null,
          hubspot_deal_id: opt(parsed.hubspotDealId) ?? null,
          guest_first_name: opt(parsed.firstName) ?? null,
          guest_last_name: opt(parsed.lastName) ?? null,
          guest_email: parsed.email,
          guest_phone: opt(parsed.phone) ?? null,
          tour_type: parsed.tourType,
          timezone: parsed.timezone ?? env.DEFAULT_TIMEZONE,
          scheduled_start_time: bookingResult.success
            ? bookingResult.startTime
            : parsed.startTime,
          scheduled_end_time: bookingResult.success ? bookingResult.endTime : null,
          duration_minutes: parsed.durationMinutes ?? env.DEFAULT_TOUR_DURATION_MINUTES,
          hubspot_slug: slug,
          hubspot_meeting_url: meetingUrl,
          hubspot_calendar_event_id: bookingResult.success
            ? bookingResult.calendarEventId
            : null,
          hubspot_booking_response: bookingResult.success
            ? (bookingResult.hubspotResponse as Record<string, unknown>)
            : ((bookingResult as { hubspotResponse?: unknown }).hubspotResponse as
                | Record<string, unknown>
                | undefined) ?? null,
          booking_status: bookingStatus,
          error_message: bookingResult.success ? null : bookingResult.error,
        });

        if (bookingResult.success && parsed.hubspotDealId) {
          await updateHubspotDeal({
            hubspotDealId: parsed.hubspotDealId,
            properties: buildDealUpdateProperties({
              tourType: parsed.tourType,
              startTime: bookingResult.startTime,
            }),
          });
        }

        const response = bookingResult.success
          ? {
              success: true,
              tourType: bookingResult.tourType,
              startTime: bookingResult.startTime,
              endTime: bookingResult.endTime,
              timezone: bookingResult.timezone,
              calendarEventId: bookingResult.calendarEventId,
              messageForAgent: bookingResult.messageForAgent,
            }
          : {
              success: false,
              tourType: parsed.tourType,
              messageForAgent: bookingResult.fallbackMessageForAgent,
              fallbackMessageForAgent: bookingResult.fallbackMessageForAgent,
              error: bookingResult.error,
            };

        await logToolCall({
          toolName: "book_tour",
          sessionId: opt(parsed.sessionId),
          status: bookingResult.success ? "success" : "error",
          request: parsed,
          response,
          errorMessage: bookingResult.success ? undefined : bookingResult.error,
          startedAt,
        });

        return jsonResult(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const response = {
          success: false,
          tourType: parsed.tourType,
          messageForAgent:
            "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you.",
          fallbackMessageForAgent:
            "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you.",
          error: message,
        };

        await logToolCall({
          toolName: "book_tour",
          sessionId: opt(parsed.sessionId),
          status: "error",
          request: parsed,
          response,
          errorMessage: message,
          startedAt,
        });

        return jsonResult(response);
      }
    }
  );

  server.registerTool(
    "log_retell_session",
    {
      description: "Saves Retell call/session metadata into Supabase.",
      inputSchema: logRetellSessionInputSchema.shape,
    },
    async (input) => {
      const startedAt = Date.now();
      const parsed = logRetellSessionInputSchema.parse(input);

      try {
        const payload = logRetellSessionInputToPayload(
          Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => value !== null)
          ) as Parameters<typeof logRetellSessionInputToPayload>[0]
        );
        const normalized = normalizeRetellSession(payload);
        const result = await upsertRetellSession(normalized);

        const response = result.success
          ? { success: true, sessionId: normalized.session_id }
          : { success: false, error: result.error ?? "Failed to save session" };

        await logToolCall({
          toolName: "log_retell_session",
          sessionId: normalized.session_id,
          status: result.success ? "success" : "error",
          request: parsed,
          response,
          errorMessage: result.success ? undefined : result.error,
          startedAt,
        });

        return jsonResult(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const response = { success: false, error: message };

        await logToolCall({
          toolName: "log_retell_session",
          sessionId: opt(parsed.sessionId),
          status: "error",
          request: parsed,
          response,
          errorMessage: message,
          startedAt,
        });

        return jsonResult(response);
      }
    }
  );

  server.registerTool(
    "log_tour_preference",
    {
      description: "Logs tour interest even if the guest does not complete booking.",
      inputSchema: logTourPreferenceInputSchema.shape,
    },
    async (input) => {
      const startedAt = Date.now();
      const parsed = logTourPreferenceInputSchema.parse(input);

      try {
        const env = getEnv();
        const result = await insertTourBooking({
          session_id: opt(parsed.sessionId) ?? null,
          hubspot_contact_id: opt(parsed.hubspotContactId) ?? null,
          hubspot_deal_id: opt(parsed.hubspotDealId) ?? null,
          guest_email: opt(parsed.guestEmail) ?? null,
          guest_phone: opt(parsed.guestPhone) ?? null,
          tour_type: parsed.tourType ?? "unknown",
          timezone: env.DEFAULT_TIMEZONE,
          requested_day: parsed.requestedDay ?? null,
          requested_time: parsed.requestedTime ?? null,
          booking_status: parsed.status,
        });

        const response = result.success
          ? { success: true, id: result.id }
          : { success: false, error: result.error ?? "Failed to log preference" };

        await logToolCall({
          toolName: "log_tour_preference",
          sessionId: opt(parsed.sessionId),
          status: result.success ? "success" : "error",
          request: parsed,
          response,
          errorMessage: result.success ? undefined : result.error,
          startedAt,
        });

        return jsonResult(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const response = { success: false, error: message };

        await logToolCall({
          toolName: "log_tour_preference",
          sessionId: opt(parsed.sessionId),
          status: "error",
          request: parsed,
          response,
          errorMessage: message,
          startedAt,
        });

        return jsonResult(response);
      }
    }
  );

  return server;
}

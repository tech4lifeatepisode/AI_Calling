import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  bookTourInputSchema,
  checkRoomAvailabilityInputSchema,
  getRoomPricingInputSchema,
  getTourAvailabilityInputSchema,
  listSelectableRoomTypesInputSchema,
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
import {
  checkRoomAvailability,
  getRoomPricing,
  listSelectableRooms,
} from "../services/episodeRoomBooking.js";
import { resolveGuestContactForBooking } from "../services/guestContactResolver.js";
import { resolveCallContext, sanitizeGuestEmail } from "../services/callContext.js";
import { sendTourBookingNotification } from "../services/tourBookingEmail.js";

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

        const totalSlots = slots.length;

        let messageForAgent: string;
        if (availableSlots.length > 0) {
          const times = availableSlots.map((slot) => slot.displayTimeMadrid).join(", ");
          messageForAgent =
            `Only offer these exact HubSpot slots to the guest (do not invent other times): ${times}. ` +
            (availableSlots.length === 1
              ? "Ask if this time works."
              : "Offer one or two of these times and ask which works best.");
        } else if (totalSlots > 0) {
          messageForAgent =
            "No slots matched the guest's preferred day/time, but other times are available. Ask for a broader preference or offer to send booking links by WhatsApp.";
        } else {
          messageForAgent =
            "No available tour slots were found for the requested period. Offer to send tour links by WhatsApp instead.";
        }

        const response = {
          success: true,
          tourType: parsed.tourType,
          timezone,
          availableSlots,
          totalSlotsFound: totalSlots,
          messageForAgent,
        };

        await logToolCall({
          toolName: "get_tour_availability",
          sessionId: parsed.sessionId ?? undefined,
          status: "success",
          request: parsed,
          response: {
            ...response,
            debugRawHubSpotResponse: totalSlots === 0 ? rawResponse : undefined,
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
        "Books a HubSpot tour after the guest explicitly confirms the selected slot. Always pass sessionId (Retell call_id). Prefer hubspotDealId and hubspotContactId from call metadata — never use placeholder emails. Only tell the guest the tour is booked when this tool returns success: true.",
      inputSchema: bookTourInputSchema.shape,
    },
    async (input) => {
      const startedAt = Date.now();
      const parsed = bookTourInputSchema.parse(input);

      const callContext = await resolveCallContext({
        sessionId: opt(parsed.sessionId),
        hubspotDealId: opt(parsed.hubspotDealId),
        hubspotContactId: opt(parsed.hubspotContactId),
      });

      const resolvedGuest = await resolveGuestContactForBooking({
        email: sanitizeGuestEmail(parsed.email) ?? callContext.hubspotContactEmail,
        firstName: opt(parsed.firstName),
        lastName: opt(parsed.lastName),
        phone: opt(parsed.phone),
        hubspotContactId: callContext.hubspotContactId,
        hubspotDealId: callContext.hubspotDealId,
      });

      if (!resolvedGuest.ok) {
        const response = {
          success: false,
          messageForAgent: resolvedGuest.error,
          fallbackMessageForAgent:
            "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you.",
        };
        await logToolCall({
          toolName: "book_tour",
          sessionId: callContext.sessionId,
          status: "error",
          request: parsed,
          response,
          errorMessage: resolvedGuest.error,
          startedAt,
        });
        return jsonResult(response);
      }

      const guest = resolvedGuest.guest;

      if (!parsed.startTime) {
        const response = {
          success: false,
          messageForAgent: "A start time is required to book a tour.",
          fallbackMessageForAgent:
            "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you.",
        };
        await logToolCall({
          toolName: "book_tour",
          sessionId: callContext.sessionId,
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
          email: guest.email,
          firstName: guest.firstName,
          lastName: guest.lastName,
          phone: guest.phone,
          hubspotContactId: guest.hubspotContactId ?? callContext.hubspotContactId,
          hubspotDealId: callContext.hubspotDealId,
          sessionId: callContext.sessionId,
        });

        const bookingStatus = bookingResult.success ? "booked" : "failed";

        await insertTourBooking({
          session_id: callContext.sessionId ?? null,
          hubspot_contact_id: bookingResult.success
            ? bookingResult.contactId ?? guest.hubspotContactId ?? callContext.hubspotContactId ?? null
            : guest.hubspotContactId ?? callContext.hubspotContactId ?? null,
          hubspot_deal_id: callContext.hubspotDealId ?? null,
          guest_first_name: guest.firstName ?? null,
          guest_last_name: guest.lastName ?? null,
          guest_email: guest.email,
          guest_phone: guest.phone ?? null,
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

        if (bookingResult.success && callContext.hubspotDealId) {
          await updateHubspotDeal({
            hubspotDealId: callContext.hubspotDealId,
            properties: buildDealUpdateProperties({
              tourType: parsed.tourType,
              startTime: bookingResult.startTime,
            }),
          });
        }

        if (bookingResult.success) {
          await sendTourBookingNotification({
            tourType: parsed.tourType,
            startTime: bookingResult.startTime,
            timezone: bookingResult.timezone ?? parsed.timezone ?? env.DEFAULT_TIMEZONE,
            guestEmail: guest.email,
            guestFirstName: guest.firstName,
            guestLastName: guest.lastName,
            hubspotDealId: callContext.hubspotDealId,
            hubspotContactId:
              bookingResult.contactId ??
              guest.hubspotContactId ??
              callContext.hubspotContactId,
          });
        }

        const bookingFailedMessage =
          "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you. Do not tell the guest the tour is booked.";

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
              messageForAgent: bookingFailedMessage,
              fallbackMessageForAgent: bookingFailedMessage,
              error: bookingResult.error,
            };

        await logToolCall({
          toolName: "book_tour",
          sessionId: callContext.sessionId,
          status: bookingResult.success ? "success" : "error",
          request: parsed,
          response,
          errorMessage: bookingResult.success ? undefined : bookingResult.error,
          startedAt,
        });

        return jsonResult(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const bookingFailedMessage =
          "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you. Do not tell the guest the tour is booked.";
        const response = {
          success: false,
          tourType: parsed.tourType,
          messageForAgent: bookingFailedMessage,
          fallbackMessageForAgent: bookingFailedMessage,
          error: message,
        };

        await logToolCall({
          toolName: "book_tour",
          sessionId: callContext.sessionId,
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
        const callContext = await resolveCallContext({
          sessionId: opt(parsed.sessionId),
          hubspotDealId: opt(parsed.hubspotDealId),
          hubspotContactId: opt(parsed.hubspotContactId),
        });
        const env = getEnv();
        const result = await insertTourBooking({
          session_id: callContext.sessionId ?? null,
          hubspot_contact_id: callContext.hubspotContactId ?? null,
          hubspot_deal_id: callContext.hubspotDealId ?? null,
          guest_email: sanitizeGuestEmail(parsed.guestEmail) ?? callContext.hubspotContactEmail ?? null,
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
          sessionId: callContext.sessionId,
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

  server.registerTool(
    "list_selectable_room_types",
    {
      description:
        "Lists room types selectable on booking.episode.life for the given stay dates.",
      inputSchema: listSelectableRoomTypesInputSchema.shape,
    },
    async (input) => {
      const startedAt = Date.now();
      const parsed = listSelectableRoomTypesInputSchema.parse(input);

      try {
        const response = await listSelectableRooms({
          checkIn: parsed.checkIn,
          checkOut: parsed.checkOut,
          sessionId: parsed.sessionId,
          hubspotDealId: parsed.hubspotDealId,
          hubspotContactId: parsed.hubspotContactId,
          requestSource: "mcp",
        });

        await logToolCall({
          toolName: "list_selectable_room_types",
          sessionId: parsed.sessionId,
          status: "success",
          request: parsed,
          response,
          startedAt,
        });

        return jsonResult(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const response = { ok: false, error: message, spokenSummary: message };

        await logToolCall({
          toolName: "list_selectable_room_types",
          sessionId: parsed.sessionId,
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
    "check_room_availability",
    {
      description:
        "Checks if a room is selectable on the website and available via Housemonk for the given dates.",
      inputSchema: checkRoomAvailabilityInputSchema.shape,
    },
    async (input) => {
      const startedAt = Date.now();
      const parsed = checkRoomAvailabilityInputSchema.parse(input);

      try {
        const response = await checkRoomAvailability({
          unitTypeSlug: parsed.unitTypeSlug,
          checkIn: parsed.checkIn,
          checkOut: parsed.checkOut,
          sessionId: parsed.sessionId,
          hubspotDealId: parsed.hubspotDealId,
          hubspotContactId: parsed.hubspotContactId,
          requestSource: "mcp",
        });

        await logToolCall({
          toolName: "check_room_availability",
          sessionId: parsed.sessionId,
          status: response.ok ? "success" : "error",
          request: parsed,
          response,
          errorMessage: response.ok ? undefined : (response as { error?: string }).error,
          startedAt,
        });

        return jsonResult(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const response = { ok: false, error: message, spokenSummary: message };

        await logToolCall({
          toolName: "check_room_availability",
          sessionId: parsed.sessionId,
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
    "get_room_pricing",
    {
      description:
        "Gets live Housemonk pricing for a room after selectability and availability checks.",
      inputSchema: getRoomPricingInputSchema.shape,
    },
    async (input) => {
      const startedAt = Date.now();
      const parsed = getRoomPricingInputSchema.parse(input);

      try {
        const response = await getRoomPricing({
          unitTypeSlug: parsed.unitTypeSlug,
          checkIn: parsed.checkIn,
          checkOut: parsed.checkOut,
          people: parsed.people,
          promoCode: parsed.promoCode,
          paymentOption: parsed.paymentOption,
          sessionId: parsed.sessionId,
          hubspotDealId: parsed.hubspotDealId,
          hubspotContactId: parsed.hubspotContactId,
          requestSource: "mcp",
        });

        await logToolCall({
          toolName: "get_room_pricing",
          sessionId: parsed.sessionId,
          status: response.ok ? "success" : "error",
          request: parsed,
          response,
          errorMessage: response.ok ? undefined : (response as { error?: string }).error,
          startedAt,
        });

        return jsonResult(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const response = { ok: false, error: message, spokenSummary: message };

        await logToolCall({
          toolName: "get_room_pricing",
          sessionId: parsed.sessionId,
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

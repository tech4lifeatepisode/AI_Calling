import { getEnv } from "./env.js";
import { logger } from "./logger.js";
import type {
  AvailableSlot,
  BookTourInput,
  BookTourResult,
  HubSpotAvailabilityPageResponse,
  HubSpotBookingInfo,
  HubSpotBookingResponse,
  HubSpotMeetingLink,
  TourAvailabilityInput,
  TourAvailabilityResult,
  TourType,
  UpdateHubspotDealInput,
} from "../types/hubspot.js";

const SCHEDULER_VERSION = "2026-03";

function getSlugForTourType(tourType: TourType): string {
  const env = getEnv();
  return tourType === "virtual" ? env.HUBSPOT_VIRTUAL_SLUG : env.HUBSPOT_IN_PERSON_SLUG;
}

function getMeetingUrlForTourType(tourType: TourType): string {
  const env = getEnv();
  return tourType === "virtual"
    ? env.HUBSPOT_VIRTUAL_MEETING_URL
    : env.HUBSPOT_IN_PERSON_MEETING_URL;
}

async function hubspotFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; errorText?: string }> {
  const env = getEnv();
  const url = `${env.HUBSPOT_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: T | null = null;

  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    logger.error("HubSpot API error", {
      path,
      status: response.status,
      message: text.slice(0, 500),
    });
    return { ok: false, status: response.status, data, errorText: text };
  }

  return { ok: true, status: response.status, data };
}

export async function getMeetingLinks(): Promise<HubSpotMeetingLink[]> {
  const result = await hubspotFetch<{ results?: HubSpotMeetingLink[] }>(
    `/scheduler/${SCHEDULER_VERSION}/meetings/meeting-links?limit=100`
  );

  return result.data?.results ?? [];
}

function parseAvailabilityResponse(
  raw: HubSpotAvailabilityPageResponse | HubSpotBookingInfo,
  tourType: TourType,
  timezone: string,
  defaultDurationMinutes: number
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const linkAvailability =
    raw.linkAvailability ??
    (raw as HubSpotAvailabilityPageResponse).linkAvailability;

  const byDuration = linkAvailability?.linkAvailabilityByDuration ?? {};

  for (const [durationKey, durationData] of Object.entries(byDuration)) {
    const durationMs = Number(durationKey);
    const durationMinutes = Number.isFinite(durationMs)
      ? Math.round(durationMs / 60000)
      : defaultDurationMinutes;

    const availabilities = durationData?.availabilities ?? [];

    for (const slot of availabilities) {
      const startMs = slot.startMillisUtc;
      const endMs = slot.endMillisUtc;

      if (startMs === undefined || endMs === undefined) continue;

      slots.push({
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        durationMinutes,
        timezone,
        tourType,
        likelyAvailableUserIds: slot.likelyAvailableUserIds,
      });
    }
  }

  slots.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return slots;
}

export async function getTourAvailability(
  input: TourAvailabilityInput
): Promise<TourAvailabilityResult> {
  const env = getEnv();
  const slug = getSlugForTourType(input.tourType);
  const timezone = input.timezone ?? env.DEFAULT_TIMEZONE;
  const params = new URLSearchParams({ timezone });
  if (input.monthOffset !== undefined) {
    params.set("monthOffset", String(input.monthOffset));
  }

  const result = await hubspotFetch<HubSpotAvailabilityPageResponse>(
    `/scheduler/${SCHEDULER_VERSION}/meetings/meeting-links/book/availability-page/${slug}?${params.toString()}`
  );

  if (!result.ok || !result.data) {
    return { slots: [], rawResponse: result.data ?? { error: result.errorText } };
  }

  const slots = parseAvailabilityResponse(
    result.data,
    input.tourType,
    timezone,
    env.DEFAULT_TOUR_DURATION_MINUTES
  );

  return { slots, rawResponse: result.data };
}

export async function getBookingInfo(
  tourType: TourType,
  timezone: string
): Promise<{ ok: boolean; data?: HubSpotBookingInfo; error?: string }> {
  const slug = getSlugForTourType(tourType);
  const params = new URLSearchParams({ timezone });

  const result = await hubspotFetch<HubSpotBookingInfo>(
    `/scheduler/${SCHEDULER_VERSION}/meetings/meeting-links/book/${slug}?${params.toString()}`
  );

  if (!result.ok) {
    return { ok: false, error: result.errorText ?? "Failed to fetch booking info" };
  }

  return { ok: true, data: result.data ?? undefined };
}

function buildLegalConsentResponses(
  bookingInfo: HubSpotBookingInfo | undefined
): Array<{ communicationTypeId: string; consented: boolean }> {
  const options = bookingInfo?.customParams?.legalConsentOptions ?? [];
  return options.map((opt) => ({
    communicationTypeId: opt.communicationTypeId,
    consented: true,
  }));
}

function buildFormFields(
  input: BookTourInput,
  bookingInfo: HubSpotBookingInfo | undefined
): Array<{ name: string; value: string }> {
  const fields: Array<{ name: string; value: string }> = [];

  if (input.formFields?.length) {
    fields.push(...input.formFields);
  }

  if (input.phone) {
    const hasPhone = fields.some((f) => f.name.toLowerCase() === "phone");
    if (!hasPhone) {
      fields.push({ name: "phone", value: input.phone });
    }
  }

  const requiredFields = bookingInfo?.customParams?.formFields ?? [];
  for (const field of requiredFields) {
    if (!field.required) continue;
    const exists = fields.some((f) => f.name === field.name);
    if (exists) continue;

    if (field.name.toLowerCase() === "email" && input.email) {
      fields.push({ name: field.name, value: input.email });
    } else if (field.name.toLowerCase() === "firstname" && input.firstName) {
      fields.push({ name: field.name, value: input.firstName });
    } else if (field.name.toLowerCase() === "lastname" && input.lastName) {
      fields.push({ name: field.name, value: input.lastName });
    } else if (field.name.toLowerCase() === "phone" && input.phone) {
      fields.push({ name: field.name, value: input.phone });
    }
  }

  return fields;
}

export async function bookTour(input: BookTourInput): Promise<BookTourResult> {
  const env = getEnv();
  const slug = getSlugForTourType(input.tourType);
  const timezone = input.timezone ?? env.DEFAULT_TIMEZONE;
  const durationMinutes = input.durationMinutes ?? env.DEFAULT_TOUR_DURATION_MINUTES;
  const durationMs = durationMinutes * 60 * 1000;

  const bookingInfoResult = await getBookingInfo(input.tourType, timezone);
  if (!bookingInfoResult.ok) {
    return {
      success: false,
      error: bookingInfoResult.error ?? "Failed to fetch HubSpot booking metadata",
      fallbackMessageForAgent:
        "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you.",
    };
  }

  const bookingInfo = bookingInfoResult.data;
  const formFields = buildFormFields(input, bookingInfo);
  const legalConsentResponses = buildLegalConsentResponses(bookingInfo);

  const body = {
    slug,
    email: input.email,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    startTime: input.startTime,
    duration: durationMs,
    timezone,
    locale: "en",
    formFields,
    legalConsentResponses,
    likelyAvailableUserIds: input.likelyAvailableUserIds ?? [],
  };

  const params = new URLSearchParams({ timezone });
  const result = await hubspotFetch<HubSpotBookingResponse>(
    `/scheduler/${SCHEDULER_VERSION}/meetings/meeting-links/book?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  if (!result.ok || !result.data) {
    const errorMessage =
      (result.data as { message?: string } | null)?.message ??
      result.errorText ??
      "HubSpot booking failed";

    return {
      success: false,
      error: errorMessage,
      fallbackMessageForAgent:
        "I'm sorry, I couldn't complete the booking right now. I'll send you the tour links by WhatsApp so you can choose the time that works best for you.",
      hubspotResponse: result.data ?? { error: result.errorText },
    };
  }

  const data = result.data;
  const tourLabel = input.tourType === "virtual" ? "virtual tour" : "in-person tour";

  return {
    success: true,
    tourType: input.tourType,
    startTime: data.start ?? input.startTime,
    endTime: data.end ?? new Date(new Date(input.startTime).getTime() + durationMs).toISOString(),
    timezone: data.bookingTimezone ?? timezone,
    calendarEventId: data.calendarEventId ?? "",
    contactId: data.contactId,
    messageForAgent: `The ${tourLabel} has been booked successfully.`,
    hubspotResponse: data,
  };
}

export async function updateHubspotDeal(
  input: UpdateHubspotDealInput
): Promise<{ success: boolean; error?: string }> {
  if (!input.hubspotDealId) {
    return { success: false, error: "hubspotDealId is required" };
  }

  try {
    const result = await hubspotFetch<{ id?: string }>(
      `/crm/v3/objects/deals/${input.hubspotDealId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ properties: input.properties }),
      }
    );

    if (!result.ok) {
      const message =
        (result.data as { message?: string } | null)?.message ??
        result.errorText ??
        "Deal update failed";
      logger.warn("HubSpot deal update failed (non-fatal)", {
        dealId: input.hubspotDealId,
        message,
      });
      return { success: false, error: message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("HubSpot deal update exception (non-fatal)", {
      dealId: input.hubspotDealId,
      message,
    });
    return { success: false, error: message };
  }
}

export function buildDealUpdateProperties(input: {
  tourType: TourType;
  startTime: string;
  callSummary?: string;
}): Record<string, string> {
  return {
    // Custom deal properties — create these in HubSpot before relying on them.
    ai_tour_interest: "yes",
    ai_tour_type: input.tourType,
    ai_tour_scheduled: "yes",
    ai_tour_scheduled_datetime: input.startTime,
    ...(input.callSummary ? { ai_call_summary: input.callSummary } : {}),
    ai_recommended_next_action: "tour_booked",
  };
}

export function getMeetingUrl(tourType: TourType): string {
  return getMeetingUrlForTourType(tourType);
}

export function formatDisplayTimeMadrid(isoTime: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoTime));
}

export function filterSlotsByPreference(
  slots: AvailableSlot[],
  preferredDay?: string,
  preferredTime?: string,
  limit = 5
): AvailableSlot[] {
  let filtered = [...slots];

  if (preferredDay) {
    const dayLower = preferredDay.toLowerCase();
    filtered = filtered.filter((slot) => {
      const dayName = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Madrid",
        weekday: "long",
      })
        .format(new Date(slot.startTime))
        .toLowerCase();
      const dateStr = slot.startTime.slice(0, 10);
      return dayName.includes(dayLower) || dateStr.includes(dayLower) || slot.startTime.includes(dayLower);
    });
  }

  if (filtered.length === 0) {
    filtered = [...slots];
  }

  return filtered.slice(0, limit);
}

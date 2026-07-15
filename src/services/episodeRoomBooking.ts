import { getEnv } from "./env.js";
import { getAvailability, getQuote } from "./episodeBookingClient.js";
import {
  buildPricingDealUpdateProperties,
  updateHubspotDeal,
} from "./hubspot.js";
import {
  checkRoomSelectability,
  getRoomDisplayName,
  isTwoPeopleAllowedForRoom,
  listSelectableRoomTypes,
  validateStayDates,
} from "./reservarSelectability.js";
import {
  buildAvailabilitySummary,
  buildListSelectableRoomsSummary,
  buildPricingSummary,
} from "./spokenSummary.js";
import {
  getRetellSessionBySessionId,
  insertRoomPricingRequest,
  updateRetellSessionPricing,
} from "./supabase.js";

export interface CallContext {
  sessionId?: string | null;
  hubspotDealId?: string | null;
  hubspotContactId?: string | null;
  requestSource?: "mcp" | "retell";
}

export interface ListSelectableRoomsInput extends CallContext {
  checkIn: string;
  checkOut: string;
}

export interface CheckAvailabilityInput extends CallContext {
  unitTypeSlug: string;
  checkIn: string;
  checkOut: string;
}

export interface GetPricingInput extends CallContext {
  unitTypeSlug: string;
  checkIn: string;
  checkOut: string;
  people: number;
  promoCode?: string;
  paymentOption?: string;
}

interface ResolvedHubspotContext {
  hubspotDealId?: string | null;
  hubspotContactId?: string | null;
  hubspotDealName?: string | null;
  hubspotContactName?: string | null;
  hubspotContactEmail?: string | null;
}

async function resolveHubspotContext(
  ctx: CallContext
): Promise<ResolvedHubspotContext> {
  if (!ctx.sessionId) {
    return {
      hubspotDealId: ctx.hubspotDealId,
      hubspotContactId: ctx.hubspotContactId,
    };
  }

  const session = await getRetellSessionBySessionId(ctx.sessionId);
  if (!session) {
    return {
      hubspotDealId: ctx.hubspotDealId,
      hubspotContactId: ctx.hubspotContactId,
    };
  }

  return {
    hubspotDealId: ctx.hubspotDealId ?? session.hubspot_deal_id,
    hubspotContactId: ctx.hubspotContactId ?? session.hubspot_contact_id,
    hubspotDealName: session.hubspot_deal_name,
    hubspotContactName: session.hubspot_contact_name,
    hubspotContactEmail: session.hubspot_contact_email,
  };
}

export async function listSelectableRooms(input: ListSelectableRoomsInput) {
  const dateResult = validateStayDates(input.checkIn, input.checkOut);
  const rooms = listSelectableRoomTypes(input.checkIn, input.checkOut);

  const nights = dateResult.ok ? dateResult.nights : 0;
  const checkIn = dateResult.ok ? dateResult.checkIn : input.checkIn;
  const checkOut = dateResult.ok ? dateResult.checkOut : input.checkOut;

  return {
    ok: dateResult.ok,
    checkIn,
    checkOut,
    nights,
    rooms,
    reason: dateResult.ok ? null : dateResult.reason,
    spokenSummary: buildListSelectableRoomsSummary(rooms, checkIn, checkOut, nights),
  };
}

export async function checkRoomAvailability(input: CheckAvailabilityInput) {
  const displayName = getRoomDisplayName(input.unitTypeSlug);
  const selectability = checkRoomSelectability(
    input.unitTypeSlug,
    input.checkIn,
    input.checkOut
  );

  if (!selectability.selectableOnWebsite) {
    return {
      ok: true,
      selectableOnWebsite: false,
      available: false,
      unitTypeSlug: input.unitTypeSlug,
      displayName,
      nights: selectability.nights,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      reason: selectability.reason ?? "Room is not selectable on the website for this stay.",
      dataSource: null,
      spokenSummary: buildAvailabilitySummary({
        displayName,
        checkIn: selectability.checkIn,
        checkOut: selectability.checkOut,
        nights: selectability.nights,
        selectableOnWebsite: false,
        available: false,
        reason: selectability.reason,
      }),
    };
  }

  const episode = await getAvailability({
    unitTypeSlug: input.unitTypeSlug,
    checkIn: selectability.checkIn,
    checkOut: selectability.checkOut,
  });

  if (!episode.ok) {
    return {
      ok: false,
      selectableOnWebsite: true,
      available: false,
      unitTypeSlug: input.unitTypeSlug,
      displayName,
      nights: selectability.nights,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      reason: episode.message,
      dataSource: null,
      spokenSummary: episode.message,
      error: episode.error,
    };
  }

  const available = episode.available;
  const reason = available ? null : (episode.reason ?? "No availability for those dates.");

  return {
    ok: true,
    selectableOnWebsite: true,
    available,
    unitTypeSlug: input.unitTypeSlug,
    displayName,
    nights: episode.days ?? selectability.nights,
    checkIn: selectability.checkIn,
    checkOut: selectability.checkOut,
    stayType: episode.stayType ?? null,
    reason,
    dataSource: episode.dataSource ?? "housemonk",
    spokenSummary: buildAvailabilitySummary({
      displayName,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      nights: episode.days ?? selectability.nights,
      selectableOnWebsite: true,
      available,
      reason,
    }),
  };
}

export async function getRoomPricing(input: GetPricingInput) {
  const startedAt = Date.now();
  const displayName = getRoomDisplayName(input.unitTypeSlug);
  const hubspot = await resolveHubspotContext(input);
  const requestSource = input.requestSource ?? "mcp";

  const selectability = checkRoomSelectability(
    input.unitTypeSlug,
    input.checkIn,
    input.checkOut
  );

  const baseAudit = {
    session_id: input.sessionId ?? null,
    hubspot_deal_id: hubspot.hubspotDealId ?? null,
    hubspot_contact_id: hubspot.hubspotContactId ?? null,
    hubspot_deal_name: hubspot.hubspotDealName ?? null,
    hubspot_contact_name: hubspot.hubspotContactName ?? null,
    hubspot_contact_email: hubspot.hubspotContactEmail ?? null,
    unit_type_slug: input.unitTypeSlug,
    display_name: displayName,
    check_in: selectability.checkIn,
    check_out: selectability.checkOut,
    nights: selectability.nights,
    people: input.people,
    promo_code: input.promoCode ?? null,
    payment_option: input.paymentOption ?? null,
    request_source: requestSource,
    tool_name: "get_room_pricing",
  };

  async function logPricingRequest(
    status: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    await insertRoomPricingRequest({
      ...baseAudit,
      selectable_on_website: selectability.selectableOnWebsite,
      status,
      latency_ms: Date.now() - startedAt,
      ...fields,
    } as Parameters<typeof insertRoomPricingRequest>[0]);
  }

  if (!selectability.selectableOnWebsite) {
    const spokenSummary = buildPricingSummary({
      displayName,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      nights: selectability.nights,
      selectableOnWebsite: false,
      available: false,
      reason: selectability.reason,
    });

    await logPricingRequest("rejected_selectability", {
      available: false,
      spoken_summary: spokenSummary,
      error_message: selectability.reason ?? null,
    });

    return {
      ok: true,
      selectableOnWebsite: false,
      available: false,
      unitTypeSlug: input.unitTypeSlug,
      displayName,
      nights: selectability.nights,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      reason: selectability.reason,
      spokenSummary,
    };
  }

  if (!isTwoPeopleAllowedForRoom(input.unitTypeSlug) && input.people === 2) {
    const reason = "Studio Standard does not allow 2 guests. Please quote for 1 guest.";
    const spokenSummary = buildPricingSummary({
      displayName,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      nights: selectability.nights,
      selectableOnWebsite: true,
      available: false,
      reason,
    });

    await logPricingRequest("rejected_selectability", {
      available: false,
      spoken_summary: spokenSummary,
      error_message: reason,
    });

    return {
      ok: true,
      selectableOnWebsite: true,
      available: false,
      unitTypeSlug: input.unitTypeSlug,
      displayName,
      nights: selectability.nights,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      reason,
      spokenSummary,
    };
  }

  const availability = await getAvailability({
    unitTypeSlug: input.unitTypeSlug,
    checkIn: selectability.checkIn,
    checkOut: selectability.checkOut,
  });

  if (!availability.ok) {
    const spokenSummary = availability.message;
    await logPricingRequest("error", {
      available: false,
      spoken_summary: spokenSummary,
      error_message: availability.message,
      episode_availability_response: null,
    });

    return {
      ok: false,
      selectableOnWebsite: true,
      available: false,
      unitTypeSlug: input.unitTypeSlug,
      displayName,
      nights: selectability.nights,
      reason: availability.message,
      spokenSummary,
      error: availability.error,
    };
  }

  if (!availability.available) {
    const reason = availability.reason ?? "No availability for those dates.";
    const spokenSummary = buildPricingSummary({
      displayName,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      nights: availability.days ?? selectability.nights,
      selectableOnWebsite: true,
      available: false,
      reason,
    });

    await logPricingRequest("unavailable", {
      available: false,
      spoken_summary: spokenSummary,
      episode_availability_response: availability.raw,
      error_message: reason,
    });

    return {
      ok: true,
      selectableOnWebsite: true,
      available: false,
      unitTypeSlug: input.unitTypeSlug,
      displayName,
      nights: availability.days ?? selectability.nights,
      checkIn: selectability.checkIn,
      checkOut: selectability.checkOut,
      reason,
      dataSource: availability.dataSource ?? "housemonk",
      spokenSummary,
    };
  }

  const quote = await getQuote({
    unitTypeSlug: input.unitTypeSlug,
    checkIn: selectability.checkIn,
    checkOut: selectability.checkOut,
    people: input.people,
    promoCode: input.promoCode,
    paymentOption: input.paymentOption,
  });

  if (!quote.ok) {
    const spokenSummary = quote.message;
    await logPricingRequest("error", {
      available: true,
      spoken_summary: spokenSummary,
      episode_availability_response: availability.raw,
      error_message: quote.message,
    });

    return {
      ok: false,
      selectableOnWebsite: true,
      available: true,
      unitTypeSlug: input.unitTypeSlug,
      displayName,
      nights: availability.days ?? selectability.nights,
      reason: quote.message,
      spokenSummary,
      error: quote.error,
    };
  }

  const monthlyRate = quote.precioMensualDisplay ?? quote.baseMonthlyRate;
  const spokenSummary = buildPricingSummary({
    displayName,
    checkIn: selectability.checkIn,
    checkOut: selectability.checkOut,
    nights: quote.days ?? selectability.nights,
    monthlyRate,
    securityDeposit: quote.securityDeposit,
    totalDueNow: quote.totalDueNow,
    totalPrice: quote.totalPrice,
    selectableOnWebsite: true,
    available: true,
  });

  await logPricingRequest("quoted", {
    available: true,
    base_monthly_rate: quote.baseMonthlyRate ?? null,
    precio_mensual_display: quote.precioMensualDisplay ?? null,
    security_deposit: quote.securityDeposit ?? null,
    additional_person_fee: quote.additionalPersonFee ?? null,
    total_due_now: quote.totalDueNow ?? null,
    total_due_on_docs: quote.totalDueOnDocs ?? null,
    total_rent: quote.totalRent ?? null,
    total_price: quote.totalPrice ?? null,
    stay_kind: quote.stayKind ?? null,
    data_source: quote.dataSource ?? null,
    applied_promo: quote.appliedPromo ?? null,
    promo_error: quote.promoError ?? null,
    spoken_summary: spokenSummary,
    episode_availability_response: availability.raw,
    episode_quote_response: quote.raw,
  });

  if (input.sessionId) {
    await updateRetellSessionPricing({
      session_id: input.sessionId,
      latest_unit_type_slug: input.unitTypeSlug,
      latest_check_in: selectability.checkIn,
      latest_check_out: selectability.checkOut,
      latest_stay_nights: quote.days ?? selectability.nights,
      latest_people: input.people,
      latest_monthly_rate: quote.baseMonthlyRate ?? null,
      latest_precio_mensual_display: quote.precioMensualDisplay ?? null,
      latest_security_deposit: quote.securityDeposit ?? null,
      latest_additional_person_fee: quote.additionalPersonFee ?? null,
      latest_total_due_now: quote.totalDueNow ?? null,
      latest_total_due_on_docs: quote.totalDueOnDocs ?? null,
      latest_total_rent: quote.totalRent ?? null,
      latest_total_price: quote.totalPrice ?? null,
      latest_pricing_available: true,
      latest_stay_kind: quote.stayKind ?? null,
      latest_pricing_data_source: quote.dataSource ?? null,
      latest_applied_promo: quote.appliedPromo ?? null,
      latest_pricing_quoted_at: new Date().toISOString(),
      latest_pricing_spoken_summary: spokenSummary,
    });
  }

  const env = getEnv();
  if (env.HUBSPOT_PRICING_DEAL_UPDATE_ENABLED && hubspot.hubspotDealId) {
    await updateHubspotDeal({
      hubspotDealId: hubspot.hubspotDealId,
      properties: buildPricingDealUpdateProperties({
        unitTypeSlug: input.unitTypeSlug,
        checkIn: selectability.checkIn,
        checkOut: selectability.checkOut,
        monthlyRate,
        totalDueNow: quote.totalDueNow,
        totalPrice: quote.totalPrice,
      }),
    });
  }

  return {
    ok: true,
    selectableOnWebsite: true,
    available: true,
    unitTypeSlug: input.unitTypeSlug,
    displayName,
    nights: quote.days ?? selectability.nights,
    checkIn: selectability.checkIn,
    checkOut: selectability.checkOut,
    people: quote.people ?? input.people,
    monthlyRate,
    precioMensualDisplay: quote.precioMensualDisplay ?? null,
    baseMonthlyRate: quote.baseMonthlyRate ?? null,
    prePromoMonthlyRent: quote.prePromoMonthlyRent ?? null,
    securityDeposit: quote.securityDeposit ?? null,
    additionalPersonFee: quote.additionalPersonFee ?? null,
    totalDueNow: quote.totalDueNow ?? null,
    totalDueOnDocs: quote.totalDueOnDocs ?? null,
    totalRent: quote.totalRent ?? null,
    totalPrice: quote.totalPrice ?? null,
    stayKind: quote.stayKind ?? null,
    dataSource: quote.dataSource ?? "housemonk",
    appliedPromo: quote.appliedPromo ?? null,
    promoError: quote.promoError ?? null,
    reason: null,
    spokenSummary,
  };
}

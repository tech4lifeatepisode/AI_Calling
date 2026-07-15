import {
  daysFromToday,
  isStayCheckInOutWithinJune1August31,
  nightsBetween,
  normalizeDateInput,
} from "./dateUtils.js";

export const MIN_STAY_NIGHTS = 30;
export const MAX_STAY_NIGHTS = 363;
export const CHECKIN_BUFFER_DAYS = 4;

export const SELECTABLE_ROOM_TYPES = [
  { slug: "the-comfort", displayName: "Studio Comfort" },
  { slug: "the-standard-with-terrace", displayName: "Studio Standard w/ Terrace" },
  { slug: "the-standard", displayName: "Studio Standard" },
  { slug: "the-two-bedroom-2-1", displayName: "2 Bedroom (2+1)" },
] as const;

export const NEVER_SELECTABLE_SLUGS = [
  "the-rooftop",
  "the-two-bedroom-2-2",
  "the-two-bedroom-with-terrace",
  "the-two-bedroom-rooftop",
] as const;

const STANDARD_MIN_NIGHTS = 180;

export interface StayDateValidation {
  ok: true;
  checkIn: string;
  checkOut: string;
  nights: number;
}

export interface StayDateRejection {
  ok: false;
  reason: string;
}

export type StayDateResult = StayDateValidation | StayDateRejection;

export interface SelectableRoomRow {
  slug: string;
  displayName: string;
  selectable: boolean;
  reason?: string;
}

export function validateStayDates(checkIn: string, checkOut: string): StayDateResult {
  const normalizedCheckIn = normalizeDateInput(checkIn);
  const normalizedCheckOut = normalizeDateInput(checkOut);

  if (!normalizedCheckIn || !normalizedCheckOut) {
    return { ok: false, reason: "Dates must be in YYYY-MM-DD format." };
  }

  if (normalizedCheckOut <= normalizedCheckIn) {
    return { ok: false, reason: "Check-out must be after check-in." };
  }

  const nights = nightsBetween(normalizedCheckIn, normalizedCheckOut);

  if (nights < MIN_STAY_NIGHTS) {
    return {
      ok: false,
      reason: `Minimum stay is ${MIN_STAY_NIGHTS} nights.`,
    };
  }

  if (nights > MAX_STAY_NIGHTS) {
    return {
      ok: false,
      reason: `Maximum stay is ${MAX_STAY_NIGHTS} nights.`,
    };
  }

  const daysUntilCheckIn = daysFromToday(normalizedCheckIn);
  if (daysUntilCheckIn < CHECKIN_BUFFER_DAYS) {
    return {
      ok: false,
      reason: `Check-in must be at least ${CHECKIN_BUFFER_DAYS} days from today.`,
    };
  }

  return {
    ok: true,
    checkIn: normalizedCheckIn,
    checkOut: normalizedCheckOut,
    nights,
  };
}

export function isTwoPeopleAllowedForRoom(roomTypeId: string): boolean {
  return roomTypeId !== "the-standard";
}

export function isRoomEnabledForSelectedStay(
  roomId: string,
  stayDurationNights: number,
  checkIn: string,
  checkOut: string
): { selectable: boolean; reason?: string } {
  if ((NEVER_SELECTABLE_SLUGS as readonly string[]).includes(roomId)) {
    return {
      selectable: false,
      reason: "This room type is not available for online booking.",
    };
  }

  const isListed = SELECTABLE_ROOM_TYPES.some((r) => r.slug === roomId);
  if (!isListed) {
    return {
      selectable: false,
      reason: "Unknown room type.",
    };
  }

  if (stayDurationNights < MIN_STAY_NIGHTS || stayDurationNights > MAX_STAY_NIGHTS) {
    return {
      selectable: false,
      reason: `Stay must be between ${MIN_STAY_NIGHTS} and ${MAX_STAY_NIGHTS} nights.`,
    };
  }

  if (roomId === "the-standard") {
    if (stayDurationNights < STANDARD_MIN_NIGHTS) {
      return {
        selectable: false,
        reason: `Studio Standard requires a minimum stay of ${STANDARD_MIN_NIGHTS} nights (6 months).`,
      };
    }
    return { selectable: true };
  }

  if (roomId === "the-two-bedroom-2-1") {
    if (!isStayCheckInOutWithinJune1August31(checkIn, checkOut)) {
      return {
        selectable: false,
        reason:
          "2 Bedroom (2+1) is only available for stays entirely within June 1 to August 31 of the same year.",
      };
    }
    return { selectable: true };
  }

  return { selectable: true };
}

export function getRoomDisplayName(slug: string): string {
  const found = SELECTABLE_ROOM_TYPES.find((r) => r.slug === slug);
  return found?.displayName ?? slug;
}

export function listSelectableRoomTypes(
  checkIn: string,
  checkOut: string
): SelectableRoomRow[] {
  const dateResult = validateStayDates(checkIn, checkOut);
  const nights = dateResult.ok ? dateResult.nights : 0;
  const validDates = dateResult.ok
    ? { checkIn: dateResult.checkIn, checkOut: dateResult.checkOut }
    : { checkIn, checkOut };

  return SELECTABLE_ROOM_TYPES.map(({ slug, displayName }) => {
    if (!dateResult.ok) {
      return { slug, displayName, selectable: false, reason: dateResult.reason };
    }

    const result = isRoomEnabledForSelectedStay(
      slug,
      nights,
      validDates.checkIn,
      validDates.checkOut
    );
    return {
      slug,
      displayName,
      selectable: result.selectable,
      reason: result.reason,
    };
  });
}

export function checkRoomSelectability(
  unitTypeSlug: string,
  checkIn: string,
  checkOut: string
): { selectableOnWebsite: boolean; reason?: string; nights: number; checkIn: string; checkOut: string } {
  const dateResult = validateStayDates(checkIn, checkOut);
  if (!dateResult.ok) {
    return {
      selectableOnWebsite: false,
      reason: dateResult.reason,
      nights: 0,
      checkIn,
      checkOut,
    };
  }

  const result = isRoomEnabledForSelectedStay(
    unitTypeSlug,
    dateResult.nights,
    dateResult.checkIn,
    dateResult.checkOut
  );

  return {
    selectableOnWebsite: result.selectable,
    reason: result.reason,
    nights: dateResult.nights,
    checkIn: dateResult.checkIn,
    checkOut: dateResult.checkOut,
  };
}

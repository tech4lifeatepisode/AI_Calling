import type { AvailableSlot } from "../types/hubspot.js";

const MADRID_TZ = "Europe/Madrid";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const TIME_WINDOWS: Record<string, [number, number]> = {
  morning: [6, 12],
  afternoon: [12, 17],
  evening: [17, 21],
  night: [21, 24],
};

const WORD_HOURS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

type TimePreference =
  | { kind: "any" }
  | { kind: "after"; afterMinutes: number }
  | { kind: "window"; startHour: number; endHour: number }
  | { kind: "around"; targetMinutes: number };

function madridDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MADRID_TZ }).format(date);
}

function madridWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MADRID_TZ,
    weekday: "long",
  })
    .format(date)
    .toLowerCase();
}

function madridHourMinute(isoTime: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MADRID_TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(isoTime));

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

function slotMinutes(isoTime: string): number {
  const { hour, minute } = madridHourMinute(isoTime);
  return hour * 60 + minute;
}

function addDaysFromDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return madridDateKey(utc);
}

export function resolvePreferredDates(
  preferredDay: string,
  referenceDate = new Date()
): Set<string> | null {
  const lower = preferredDay.toLowerCase().trim();
  if (!lower) return null;

  const todayKey = madridDateKey(referenceDate);

  if (lower === "today") return new Set([todayKey]);
  if (lower === "tomorrow") return new Set([addDaysFromDateKey(todayKey, 1)]);

  for (const weekday of WEEKDAYS) {
    if (!lower.includes(weekday)) continue;

    const useNext = lower.includes("next");
    for (let offset = 0; offset <= 14; offset += 1) {
      const candidateKey = addDaysFromDateKey(todayKey, offset);
      const candidateDate = new Date(`${candidateKey}T12:00:00Z`);
      if (madridWeekday(candidateDate) !== weekday) continue;
      if (offset === 0 && useNext) continue;
      return new Set([candidateKey]);
    }
  }

  const isoMatch = lower.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return new Set([isoMatch[0]]);

  return null;
}

function parseExactTimeMinutes(preferredTime: string): number | null {
  const lower = preferredTime.toLowerCase().trim();

  const hm24 = lower.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (hm24) {
    const hour = Number(hm24[1]);
    const minute = Number(hm24[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return hour * 60 + minute;
    }
  }

  const hm12 = lower.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (hm12) {
    let hour = Number(hm12[1]) % 12;
    if (hm12[2] === "pm") hour += 12;
    return hour * 60;
  }

  const hourOnly = lower.match(/\b(\d{1,2})\b/);
  if (hourOnly) {
    const hour = Number(hourOnly[1]);
    if (hour >= 0 && hour <= 23) return hour * 60;
  }

  for (const [word, hour] of Object.entries(WORD_HOURS)) {
    if (!lower.includes(word)) continue;
    let resolvedHour = hour;
    if (lower.includes("pm") && resolvedHour < 12) resolvedHour += 12;
    if (lower.includes("am") && resolvedHour === 12) resolvedHour = 0;
    const minute = lower.includes("thirty") ? 30 : lower.includes("fifteen") ? 15 : 0;
    return resolvedHour * 60 + minute;
  }

  return null;
}

function interpretTimePreference(preferredTime: string): TimePreference {
  const lower = preferredTime.toLowerCase().trim();

  if (
    lower.includes("onwards") ||
    lower.includes("after") ||
    lower.includes("from") ||
    lower.includes("or later")
  ) {
    const mins = parseExactTimeMinutes(lower);
    if (mins !== null) return { kind: "after", afterMinutes: mins };
  }

  if (lower.includes("early")) {
    return { kind: "window", startHour: 6, endHour: 12 };
  }

  for (const [label, [startHour, endHour]] of Object.entries(TIME_WINDOWS)) {
    if (lower.includes(label)) {
      return { kind: "window", startHour, endHour };
    }
  }

  const exact = parseExactTimeMinutes(lower);
  if (exact !== null) {
    // Voice agents often pass "09:00" when the guest said "from 9 onwards".
    if (exact % 60 === 0 && !lower.includes("exactly")) {
      return { kind: "after", afterMinutes: exact };
    }
    return { kind: "around", targetMinutes: exact };
  }

  return { kind: "any" };
}

function matchesTimePreference(isoTime: string, preference: TimePreference): boolean {
  const minutes = slotMinutes(isoTime);

  switch (preference.kind) {
    case "any":
      return true;
    case "after":
      return minutes >= preference.afterMinutes;
    case "window":
      return (
        minutes >= preference.startHour * 60 && minutes < preference.endHour * 60
      );
    case "around":
      return Math.abs(minutes - preference.targetMinutes) <= 90;
  }
}

function timeDistance(isoTime: string, preference: TimePreference): number {
  const minutes = slotMinutes(isoTime);

  switch (preference.kind) {
    case "any":
      return minutes;
    case "after":
      return Math.max(0, minutes - preference.afterMinutes);
    case "window": {
      const mid = ((preference.startHour + preference.endHour) / 2) * 60;
      return Math.abs(minutes - mid);
    }
    case "around":
      return Math.abs(minutes - preference.targetMinutes);
  }
}

function matchesWeekdayPreference(slot: AvailableSlot, preferredDay: string): boolean {
  const lower = preferredDay.toLowerCase().trim();
  const weekday = madridWeekday(new Date(slot.startTime));
  return WEEKDAYS.some((day) => lower.includes(day) && weekday === day);
}

function keepNearestDateSlots(slots: AvailableSlot[]): AvailableSlot[] {
  if (slots.length === 0) return slots;

  const sorted = [...slots].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const nearestDate = madridDateKey(new Date(sorted[0].startTime));

  return sorted.filter(
    (slot) => madridDateKey(new Date(slot.startTime)) === nearestDate
  );
}

export function filterSlotsByPreference(
  slots: AvailableSlot[],
  preferredDay?: string,
  preferredTime?: string,
  limit = 5
): AvailableSlot[] {
  if (slots.length === 0) return [];

  const referenceDate = new Date();
  const targetDates = preferredDay
    ? resolvePreferredDates(preferredDay, referenceDate)
    : null;
  const timePreference = preferredTime
    ? interpretTimePreference(preferredTime)
    : { kind: "any" as const };

  let pool = [...slots];

  if (targetDates?.size) {
    const onTargetDate = pool.filter((slot) =>
      targetDates.has(madridDateKey(new Date(slot.startTime)))
    );
    if (onTargetDate.length > 0) {
      pool = onTargetDate;
    }
  } else if (preferredDay) {
    const weekdayMatches = pool.filter((slot) => matchesWeekdayPreference(slot, preferredDay));
    if (weekdayMatches.length > 0) {
      pool = keepNearestDateSlots(weekdayMatches);
    }
  }

  const timeFiltered = pool.filter((slot) =>
    matchesTimePreference(slot.startTime, timePreference)
  );
  if (timeFiltered.length > 0) {
    pool = timeFiltered;
  }

  pool.sort((a, b) => {
    const timeDiff = timeDistance(a.startTime, timePreference) - timeDistance(b.startTime, timePreference);
    if (timeDiff !== 0) return timeDiff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return pool.slice(0, limit);
}

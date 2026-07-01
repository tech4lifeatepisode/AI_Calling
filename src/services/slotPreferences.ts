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

function addDaysFromDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return madridDateKey(utc);
}

function resolvePreferredDates(
  preferredDay: string,
  referenceDate = new Date()
): Set<string> | null {
  const lower = preferredDay.toLowerCase().trim();
  if (!lower) return null;

  const todayKey = madridDateKey(referenceDate);

  if (lower === "today") return new Set([todayKey]);
  if (lower === "tomorrow") return new Set([addDaysFromDateKey(todayKey, 1)]);

  for (const weekday of WEEKDAYS) {
    if (lower.includes(weekday)) {
      const useNext = lower.includes("next");
      for (let offset = 0; offset <= 14; offset += 1) {
        const candidateKey = addDaysFromDateKey(todayKey, offset);
        const candidateDate = new Date(`${candidateKey}T12:00:00Z`);
        if (madridWeekday(candidateDate) !== weekday) continue;
        if (offset === 0 && useNext) continue;
        return new Set([candidateKey]);
      }
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

function scoreTimeMatch(hour: number, minute: number, preferredTime: string): number {
  const lower = preferredTime.toLowerCase().trim();

  for (const [label, [startHour, endHour]] of Object.entries(TIME_WINDOWS)) {
    if (!lower.includes(label)) continue;
    const slotMinutes = hour * 60 + minute;
    const start = startHour * 60;
    const end = endHour * 60;
    if (slotMinutes >= start && slotMinutes < end) return 100;
    if (slotMinutes >= start - 60 && slotMinutes < end + 60) return 70;
    return 20;
  }

  const targetMinutes = parseExactTimeMinutes(preferredTime);
  if (targetMinutes === null) return 50;

  const slotMinutes = hour * 60 + minute;
  const diff = Math.abs(slotMinutes - targetMinutes);
  if (diff === 0) return 100;
  if (diff <= 15) return 90;
  if (diff <= 30) return 75;
  if (diff <= 60) return 55;
  if (diff <= 120) return 30;
  return 0;
}

function scoreDayMatch(
  slot: AvailableSlot,
  preferredDay: string,
  targetDates: Set<string> | null
): number {
  const slotDate = new Date(slot.startTime);
  const dateKey = madridDateKey(slotDate);
  const weekday = madridWeekday(slotDate);
  const lower = preferredDay.toLowerCase().trim();

  if (targetDates?.has(dateKey)) return 100;

  for (const day of WEEKDAYS) {
    if (lower.includes(day) && weekday === day) return 85;
  }

  if (weekday.includes(lower) || lower.includes(weekday)) return 75;
  if (dateKey.includes(lower) || slot.startTime.slice(0, 10).includes(lower)) return 70;

  return 0;
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

  const scored = slots.map((slot) => {
    const { hour, minute } = madridHourMinute(slot.startTime);
    const dayScore = preferredDay
      ? scoreDayMatch(slot, preferredDay, targetDates)
      : 50;
    const timeScore = preferredTime ? scoreTimeMatch(hour, minute, preferredTime) : 50;
    const score = dayScore * 0.55 + timeScore * 0.45;

    return { slot, score, dayScore, timeScore };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime()
  );

  const strongMatches = scored.filter((entry) => entry.score >= 45);
  const selected = (strongMatches.length > 0 ? strongMatches : scored)
    .slice(0, limit)
    .map((entry) => entry.slot);

  return selected;
}

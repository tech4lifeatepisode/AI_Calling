const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string): Date | null {
  const trimmed = value.trim();
  if (!DATE_ONLY_RE.test(trimmed)) return null;

  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDateInput(value: string): string | null {
  const parsed = parseDateOnly(value);
  return parsed ? formatDateOnly(parsed) : null;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function addDays(dateStr: string, days: number): string {
  const date = parseDateOnly(dateStr);
  if (!date) return dateStr;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

export function todayDateOnly(): string {
  return formatDateOnly(new Date());
}

export function daysFromToday(dateStr: string): number {
  const target = parseDateOnly(dateStr);
  if (!target) return -1;
  const today = parseDateOnly(todayDateOnly());
  if (!today) return -1;
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function isStayCheckInOutWithinJune1August31(
  checkIn: string,
  checkOut: string
): boolean {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  if (!start || !end) return false;

  const year = start.getUTCFullYear();
  if (end.getUTCFullYear() !== year) return false;

  const june1 = Date.UTC(year, 5, 1);
  const aug31 = Date.UTC(year, 7, 31);

  return start.getTime() >= june1 && end.getTime() <= aug31;
}

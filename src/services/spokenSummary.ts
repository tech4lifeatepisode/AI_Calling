export function formatEuros(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-GB", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateSpoken(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function buildListSelectableRoomsSummary(
  rooms: Array<{ displayName: string; selectable: boolean }>,
  checkIn: string,
  checkOut: string,
  nights: number
): string {
  const selectable = rooms.filter((r) => r.selectable);
  if (selectable.length === 0) {
    return `No room types are selectable on the website for a ${nights}-night stay from ${formatDateSpoken(checkIn)} to ${formatDateSpoken(checkOut)}.`;
  }
  const names = selectable.map((r) => r.displayName).join(", ");
  return `For a ${nights}-night stay from ${formatDateSpoken(checkIn)} to ${formatDateSpoken(checkOut)}, these rooms can be booked online: ${names}.`;
}

export function buildAvailabilitySummary(params: {
  displayName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  selectableOnWebsite: boolean;
  available: boolean;
  reason?: string | null;
}): string {
  const { displayName, checkIn, checkOut, nights, selectableOnWebsite, available, reason } =
    params;

  if (!selectableOnWebsite) {
    return `${displayName} is not selectable on the website for this stay. ${reason ?? ""}`.trim();
  }

  if (available) {
    return `${displayName} is available from ${formatDateSpoken(checkIn)} to ${formatDateSpoken(checkOut)} for ${nights} nights.`;
  }

  return `${displayName} is not available from ${formatDateSpoken(checkIn)} to ${formatDateSpoken(checkOut)} for ${nights} nights. ${reason ?? "No availability for those dates."}`.trim();
}

export function buildPricingSummary(params: {
  displayName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  monthlyRate?: number;
  securityDeposit?: number;
  totalDueNow?: number;
  totalPrice?: number;
  selectableOnWebsite: boolean;
  available: boolean;
  reason?: string | null;
}): string {
  const {
    displayName,
    checkIn,
    checkOut,
    nights,
    monthlyRate,
    securityDeposit,
    totalDueNow,
    totalPrice,
    selectableOnWebsite,
    available,
    reason,
  } = params;

  if (!selectableOnWebsite) {
    return `${displayName} cannot be quoted for this stay. ${reason ?? ""}`.trim();
  }

  if (!available) {
    return `${displayName} is not available from ${formatDateSpoken(checkIn)} to ${formatDateSpoken(checkOut)}. ${reason ?? ""}`.trim();
  }

  const parts = [
    `${displayName} is available from ${formatDateSpoken(checkIn)} to ${formatDateSpoken(checkOut)} for ${nights} nights.`,
    monthlyRate !== undefined
      ? `The monthly rate is ${formatEuros(monthlyRate)} euros`
      : null,
    securityDeposit !== undefined
      ? `deposit ${formatEuros(securityDeposit)} euros`
      : null,
    totalDueNow !== undefined
      ? `total due now is ${formatEuros(totalDueNow)} euros`
      : null,
    totalPrice !== undefined && totalDueNow === undefined
      ? `total price is ${formatEuros(totalPrice)} euros`
      : null,
  ].filter(Boolean);

  return parts.join(", ") + ".";
}

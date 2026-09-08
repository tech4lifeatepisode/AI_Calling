const INVISIBLE_CHARS_RE = /[\u200B-\u200D\uFEFF\u00A0]/g;
const UNRESOLVED_TEMPLATE_RE = /^\{\{[^}]+\}\}$/;

const NUMBER_FIELDS = new Set(["durationMinutes", "people", "monthOffset"]);

const STRING_ID_FIELDS = new Set([
  "sessionId",
  "hubspotDealId",
  "hubspotContactId",
  "email",
  "guestEmail",
  "phone",
  "guestPhone",
  "firstName",
  "lastName",
  "startTime",
  "timezone",
  "tourType",
  "checkIn",
  "checkOut",
  "unitTypeSlug",
  "preferredDay",
  "preferredTime",
  "promoCode",
  "paymentOption",
  "execution_message",
  "status",
  "requestedDay",
  "requestedTime",
]);

export function stripInvisibleChars(value: string): string {
  return value.replace(INVISIBLE_CHARS_RE, "").trim();
}

export function sanitizeNulls<T>(value: T): T {
  return sanitizeValue(value, undefined) as T;
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (value === null) {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value) && key && STRING_ID_FIELDS.has(key)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, undefined));
  }

  if (typeof value === "object" && value !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [nestedKey, nested] of Object.entries(value)) {
      const next = sanitizeValue(nested, nestedKey);
      if (next !== undefined) {
        sanitized[nestedKey] = next;
      }
    }
    return sanitized;
  }

  if (typeof value === "string") {
    const cleaned = stripInvisibleChars(value);
    if (!cleaned || UNRESOLVED_TEMPLATE_RE.test(cleaned)) {
      return undefined;
    }
    if (key && NUMBER_FIELDS.has(key)) {
      const numeric = Number(cleaned);
      if (Number.isFinite(numeric)) return numeric;
    }
    return cleaned;
  }

  return value;
}

export function sanitizeMcpRequestBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;

  const request = body as {
    method?: string;
    params?: { arguments?: unknown };
  };

  if (request.method !== "tools/call" || !request.params?.arguments) {
    return body;
  }

  return {
    ...request,
    params: {
      ...request.params,
      arguments: sanitizeValue(request.params.arguments, undefined),
    },
  };
}

import { getEnv } from "./env.js";
import { logger } from "./logger.js";

export interface EpisodeClientError {
  ok: false;
  error: string;
  message: string;
}

export interface EpisodeAvailabilitySuccess {
  ok: true;
  available: boolean;
  days?: number;
  stayType?: string;
  dataSource?: string;
  reason?: string;
  raw: Record<string, unknown>;
}

export interface EpisodeQuoteSuccess {
  ok: true;
  baseMonthlyRate?: number;
  precioMensualDisplay?: number;
  prePromoMonthlyRent?: number;
  securityDeposit?: number;
  additionalPersonFee?: number;
  totalDueNow?: number;
  totalDueOnDocs?: number;
  totalRent?: number;
  totalPrice?: number;
  days?: number;
  stayKind?: string;
  people?: number;
  dataSource?: string;
  appliedPromo?: string | null;
  promoError?: string | null;
  raw: Record<string, unknown>;
}

export type EpisodeAvailabilityResult = EpisodeAvailabilitySuccess | EpisodeClientError;
export type EpisodeQuoteResult = EpisodeQuoteSuccess | EpisodeClientError;

export interface AvailabilityInput {
  unitTypeSlug: string;
  checkIn: string;
  checkOut: string;
}

export interface QuoteInput {
  unitTypeSlug: string;
  checkIn: string;
  checkOut: string;
  people: number;
  promoCode?: string;
  paymentOption?: string;
  selectedExtras?: string;
}

const RETRYABLE_STATUSES = new Set([502, 503]);

function buildUrl(path: string, params: Record<string, string>): string {
  const env = getEnv();
  const url = new URL(path, env.EPISODE_BACKEND_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function episodeFetch(
  url: string,
  timeoutMs: number,
  attempt = 0
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; errorText?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const text = await response.text();
    let data: Record<string, unknown> | null = null;

    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        if (RETRYABLE_STATUSES.has(response.status) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 500));
          return episodeFetch(url, timeoutMs, attempt + 1);
        }
        return {
          ok: false,
          status: response.status,
          data: null,
          errorText: "Invalid JSON response from Episode backend",
        };
      }
    }

    if (!response.ok) {
      if (RETRYABLE_STATUSES.has(response.status) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 500));
        return episodeFetch(url, timeoutMs, attempt + 1);
      }
      return {
        ok: false,
        status: response.status,
        data,
        errorText: (data?.message as string) ?? (data?.error as string) ?? text.slice(0, 200),
      };
    }

    return { ok: true, status: response.status, data };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (attempt === 0 && !isAbort) {
      await new Promise((r) => setTimeout(r, 500));
      return episodeFetch(url, timeoutMs, attempt + 1);
    }
    const message = isAbort
      ? "Episode backend request timed out"
      : err instanceof Error
        ? err.message
        : String(err);
    return { ok: false, status: 0, data: null, errorText: message };
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clientError(error: string, message: string): EpisodeClientError {
  return { ok: false, error, message };
}

export async function getAvailability(
  input: AvailabilityInput
): Promise<EpisodeAvailabilityResult> {
  const env = getEnv();
  const url = buildUrl("/api/housemonk/availability", {
    unitTypeSlug: input.unitTypeSlug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
  });

  const result = await episodeFetch(url, env.EPISODE_BACKEND_TIMEOUT_MS);

  if (!result.ok || !result.data) {
    logger.warn("Episode availability request failed", {
      status: result.status,
      error: result.errorText,
    });
    return clientError(
      "episode_availability_failed",
      "Could not check room availability right now. Please try again shortly."
    );
  }

  const data = result.data;
  return {
    ok: true,
    available: Boolean(data.available),
    days: toNumber(data.days),
    stayType: data.stayType as string | undefined,
    dataSource: data.dataSource as string | undefined,
    reason: data.reason as string | undefined,
    raw: data,
  };
}

export async function getQuote(input: QuoteInput): Promise<EpisodeQuoteResult> {
  const env = getEnv();
  const params: Record<string, string> = {
    unitTypeSlug: input.unitTypeSlug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    people: String(input.people),
  };
  if (input.promoCode) params.promoCode = input.promoCode;
  if (input.paymentOption) params.paymentOption = input.paymentOption;
  if (input.selectedExtras) params.selectedExtras = input.selectedExtras;

  const url = buildUrl("/api/housemonk/quote", params);
  const result = await episodeFetch(url, env.EPISODE_BACKEND_TIMEOUT_MS);

  if (!result.ok || !result.data) {
    logger.warn("Episode quote request failed", {
      status: result.status,
      error: result.errorText,
    });
    return clientError(
      "episode_quote_failed",
      "Could not retrieve pricing right now. Please try again shortly."
    );
  }

  const data = result.data;
  return {
    ok: true,
    baseMonthlyRate: toNumber(data.baseMonthlyRate),
    precioMensualDisplay: toNumber(data.precioMensualDisplay),
    prePromoMonthlyRent: toNumber(data.prePromoMonthlyRent),
    securityDeposit: toNumber(data.securityDeposit),
    additionalPersonFee: toNumber(data.additionalPersonFee),
    totalDueNow: toNumber(data.totalDueNow),
    totalDueOnDocs: toNumber(data.totalDueOnDocs),
    totalRent: toNumber(data.totalRent),
    totalPrice: toNumber(data.totalPrice),
    days: toNumber(data.days),
    stayKind: data.stayKind as string | undefined,
    people: toNumber(data.people),
    dataSource: data.dataSource as string | undefined,
    appliedPromo: (data.appliedPromo as string | null) ?? null,
    promoError: (data.promoError as string | null) ?? null,
    raw: data,
  };
}

export async function checkEpisodeBackendHealth(): Promise<{
  url: string;
  reachable: boolean;
}> {
  const env = getEnv();
  const timeoutMs = Math.min(env.EPISODE_BACKEND_TIMEOUT_MS, 10_000);

  for (const path of ["/api/housemonk/health", "/api/health"]) {
    const url = buildUrl(path, {});
    const result = await episodeFetch(url, timeoutMs);
    if (result.ok) {
      return { url: env.EPISODE_BACKEND_URL, reachable: true };
    }
  }

  return { url: env.EPISODE_BACKEND_URL, reachable: false };
}

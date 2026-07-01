import type { RetellCallSummary, RetellListCallsResponse } from "../types/retellApi.js";
import type { RetellSessionRow } from "../types/supabase.js";
import { getEnv, requireRetellApiKey } from "./env.js";
import { logger } from "./logger.js";

async function retellFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; errorText?: string }> {
  const env = getEnv();
  const apiKey = requireRetellApiKey();
  const url = `${env.RETELL_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    logger.error("Retell API error", {
      path,
      status: response.status,
      message: text.slice(0, 500),
    });
    return { ok: false, status: response.status, data, errorText: text };
  }

  return { ok: true, status: response.status, data };
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

export function phoneMatchKeys(value: string | null | undefined): string[] {
  const digits = normalizePhone(value);
  if (!digits) return [];

  const keys = new Set<string>([digits]);

  if (digits.startsWith("34") && digits.length > 9) {
    keys.add(digits.slice(2));
  } else if (digits.length === 9) {
    keys.add(`34${digits}`);
  }

  if (digits.length >= 9) {
    keys.add(digits.slice(-9));
  }

  if (digits.length >= 10) {
    keys.add(digits.slice(-10));
  }

  return [...keys];
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const leftKeys = phoneMatchKeys(a);
  const rightKeys = phoneMatchKeys(b);
  if (leftKeys.length === 0 || rightKeys.length === 0) return false;

  return leftKeys.some((left) => rightKeys.some((right) => left === right || left.endsWith(right) || right.endsWith(left)));
}

function buildEnumFilter(values: string[]): { type: "enum"; op: "in"; value: string[] } {
  return { type: "enum", op: "in", value: values };
}

function buildNumberGteFilter(value: number): { type: "number"; op: "ge"; value: number } {
  return { type: "number", op: "ge", value };
}

function indexPhoneKeys(
  byPhone: Map<string, RetellCallSummary[]>,
  phone: string | null | undefined,
  call: RetellCallSummary
): void {
  for (const key of phoneMatchKeys(phone)) {
    const bucket = byPhone.get(key) ?? [];
    bucket.push(call);
    byPhone.set(key, bucket);
  }
}

function buildStringEqFilter(value: string): { type: "string"; op: "eq"; value: string } {
  return { type: "string", op: "eq", value };
}

function buildPhoneSearchFilters(phone: string): Array<{
  field: "to_number" | "from_number";
  filter: { type: "string"; op: "eq"; value: string };
}> {
  const trimmed = phone.trim();
  const digits = normalizePhone(trimmed);
  const filters: Array<{
    field: "to_number" | "from_number";
    filter: { type: "string"; op: "eq"; value: string };
  }> = [];

  if (trimmed) {
    filters.push({ field: "to_number", filter: buildStringEqFilter(trimmed) });
    filters.push({ field: "from_number", filter: buildStringEqFilter(trimmed) });
  }

  if (digits && !trimmed.startsWith("+")) {
    const e164 = `+${digits}`;
    filters.push({ field: "to_number", filter: buildStringEqFilter(e164) });
    filters.push({ field: "from_number", filter: buildStringEqFilter(e164) });
  }

  return filters;
}

export async function findRetellCallsByPhone(phone: string): Promise<RetellCallSummary[]> {
  const seen = new Set<string>();
  const matches: RetellCallSummary[] = [];

  for (const { field, filter } of buildPhoneSearchFilters(phone)) {
    const body = {
      sort_order: "descending",
      limit: 5,
      filter_criteria: {
        call_status: buildEnumFilter(["ended"]),
        [field]: filter,
      },
    };

    const result = await retellFetch<RetellListCallsResponse>("/v3/list-calls", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!result.ok) {
      if (result.status === 429) {
        logger.warn("Retell rate limited during phone lookup", { phone, field });
        break;
      }
      continue;
    }

    for (const call of result.data?.items ?? []) {
      if (seen.has(call.call_id)) continue;
      seen.add(call.call_id);
      matches.push(call);
    }

    if (matches.length > 0) break;
  }

  matches.sort((a, b) => (b.start_timestamp ?? 0) - (a.start_timestamp ?? 0));
  return matches;
}

export async function listRetellCalls(options?: {
  startAfterMs?: number;
  callStatus?: string[];
}): Promise<RetellCallSummary[]> {
  const calls: RetellCallSummary[] = [];
  let paginationKey: string | undefined;

  do {
    const filterCriteria: Record<string, unknown> = {
      call_status: buildEnumFilter(options?.callStatus ?? ["ended"]),
    };

    if (options?.startAfterMs !== undefined) {
      filterCriteria.start_timestamp = buildNumberGteFilter(options.startAfterMs);
    }

    const body: Record<string, unknown> = {
      sort_order: "descending",
      limit: 1000,
      filter_criteria: filterCriteria,
    };

    if (paginationKey) {
      body.pagination_key = paginationKey;
    }

    const result = await retellFetch<RetellListCallsResponse>("/v3/list-calls", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!result.ok || !result.data) {
      throw new Error(result.errorText ?? `Retell list-calls failed with status ${result.status}`);
    }

    calls.push(...(result.data.items ?? []));
    paginationKey = result.data.has_more ? result.data.pagination_key : undefined;

    logger.info("Retell list-calls page fetched", {
      pageSize: result.data.items?.length ?? 0,
      totalSoFar: calls.length,
      hasMore: Boolean(result.data.has_more),
    });
  } while (paginationKey);

  return calls;
}

export async function getRetellCall(callId: string): Promise<RetellCallSummary | null> {
  const result = await retellFetch<RetellCallSummary>(`/v2/get-call/${encodeURIComponent(callId)}`);

  if (!result.ok) {
    logger.warn("Retell get-call failed", { callId, status: result.status });
    return null;
  }

  return result.data;
}

export function retellCallToSessionRow(
  call: RetellCallSummary,
  hubspotDealId?: string | null
): RetellSessionRow {
  const durationSeconds =
    call.duration_ms !== undefined
      ? call.duration_ms / 1000
      : call.call_cost?.total_duration_seconds ?? null;

  const e2eLatency = call.latency?.e2e?.p50 ?? call.latency?.e2e?.p90 ?? null;

  return {
    session_id: call.call_id,
    session_time:
      call.start_timestamp !== undefined
        ? new Date(call.start_timestamp).toISOString()
        : null,
    duration_seconds: durationSeconds,
    channel_type: "phone",
    cost: call.call_cost?.combined_cost ?? null,
    end_reason: call.disconnection_reason ?? null,
    session_status: call.call_status ?? null,
    user_sentiment: call.call_analysis?.user_sentiment ?? null,
    agent_id: call.agent_id ?? null,
    agent_version: call.agent_version !== undefined ? String(call.agent_version) : null,
    agent_name: call.agent_name ?? null,
    from_number: call.from_number ?? null,
    to_number: call.to_number ?? null,
    direction: call.direction ?? null,
    session_outcome: call.call_analysis?.call_successful === true ? "successful" : null,
    end_to_end_latency_ms: e2eLatency,
    recording_url: call.recording_url ?? null,
    scrubbed_recording_url: call.scrubbed_recording_url ?? null,
    public_log_url: call.public_log_url ?? null,
    transcript: call.transcript ?? null,
    transcript_with_tool_calls: call.transcript_with_tool_calls ?? null,
    scrubbed_transcript_with_tool_calls: call.scrubbed_transcript_with_tool_calls ?? null,
    hubspot_deal_id: hubspotDealId ?? null,
    raw_payload: call as unknown as Record<string, unknown>,
  };
}

export function buildCallIndexes(calls: RetellCallSummary[]): {
  byCallId: Map<string, RetellCallSummary>;
  byDealId: Map<string, RetellCallSummary>;
  byPhone: Map<string, RetellCallSummary[]>;
} {
  const byCallId = new Map<string, RetellCallSummary>();
  const byDealId = new Map<string, RetellCallSummary>();
  const byPhone = new Map<string, RetellCallSummary[]>();

  for (const call of calls) {
    byCallId.set(call.call_id, call);

    const metadataDealId = call.metadata?.hubspot_deal_id ?? call.metadata?.hubspotDealId;
    if (typeof metadataDealId === "string" && metadataDealId.trim()) {
      const existing = byDealId.get(metadataDealId);
      if (
        !existing ||
        (call.start_timestamp ?? 0) > (existing.start_timestamp ?? 0)
      ) {
        byDealId.set(metadataDealId, call);
      }
    }

    for (const phone of [call.from_number, call.to_number]) {
      indexPhoneKeys(byPhone, phone, call);
    }
  }

  for (const bucket of byPhone.values()) {
    bucket.sort((a, b) => (b.start_timestamp ?? 0) - (a.start_timestamp ?? 0));
  }

  return { byCallId, byDealId, byPhone };
}

export function findCallForDeal(
  dealId: string,
  dealCallId: string | null,
  contactPhone: string | null,
  indexes: ReturnType<typeof buildCallIndexes>
): RetellCallSummary | null {
  if (dealCallId && indexes.byCallId.has(dealCallId)) {
    return indexes.byCallId.get(dealCallId) ?? null;
  }

  const byMetadata = indexes.byDealId.get(dealId);
  if (byMetadata) return byMetadata;

  if (!contactPhone) return null;

  for (const key of phoneMatchKeys(contactPhone)) {
    const calls = indexes.byPhone.get(key);
    if (calls?.[0]) return calls[0];
  }

  for (const [phone, calls] of indexes.byPhone.entries()) {
    if (!phonesMatch(contactPhone, phone)) continue;
    return calls[0] ?? null;
  }

  return null;
}

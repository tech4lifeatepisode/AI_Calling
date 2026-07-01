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

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const minLen = Math.min(left.length, right.length, 9);
  return left.slice(-minLen) === right.slice(-minLen);
}

export async function listRetellCalls(options?: {
  startAfterMs?: number;
  callStatus?: string[];
}): Promise<RetellCallSummary[]> {
  const calls: RetellCallSummary[] = [];
  let paginationKey: string | undefined;

  do {
    const body: Record<string, unknown> = {
      sort_order: "descending",
      limit: 1000,
      filter_criteria: {
        call_status: options?.callStatus ?? ["ended"],
      },
    };

    if (options?.startAfterMs !== undefined) {
      (body.filter_criteria as Record<string, unknown>).start_timestamp = {
        lower_threshold: options.startAfterMs,
      };
    }

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
      const normalized = normalizePhone(phone);
      if (!normalized) continue;
      const bucket = byPhone.get(normalized) ?? [];
      bucket.push(call);
      byPhone.set(normalized, bucket);
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

  const normalizedContact = normalizePhone(contactPhone);
  if (!normalizedContact) return null;

  for (const [phone, calls] of indexes.byPhone.entries()) {
    if (!phonesMatch(normalizedContact, phone)) continue;
    return calls[0] ?? null;
  }

  return null;
}

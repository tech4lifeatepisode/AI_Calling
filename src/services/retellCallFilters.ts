import type { RetellCallSummary } from "../types/retellApi.js";
import { getEnv } from "./env.js";

export const DEFAULT_SYNC_CALL_STATUSES = ["ended", "not_connected"] as const;

export function getSyncCallStatuses(): string[] {
  const env = getEnv();
  return env.RETELL_SYNC_CALL_STATUSES.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getFailedDialDisconnectionReasons(): string[] {
  const env = getEnv();
  return env.RETELL_SYNC_FAILED_DISCONNECTION_REASONS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isFailedDialCall(call: RetellCallSummary): boolean {
  const reason = call.disconnection_reason?.trim();
  if (!reason) return false;

  return getFailedDialDisconnectionReasons().includes(reason);
}

/** Calls we persist when matched to a HubSpot deal. */
export function isSyncableRetellCall(call: RetellCallSummary): boolean {
  if (call.call_status === "ended") {
    return true;
  }

  return isFailedDialCall(call);
}

export function sortCallsByRecency(calls: RetellCallSummary[]): RetellCallSummary[] {
  return [...calls].sort((a, b) => (b.start_timestamp ?? 0) - (a.start_timestamp ?? 0));
}

export function dedupeCallsById(calls: RetellCallSummary[]): RetellCallSummary[] {
  const seen = new Set<string>();
  const unique: RetellCallSummary[] = [];

  for (const call of calls) {
    if (seen.has(call.call_id)) continue;
    seen.add(call.call_id);
    unique.push(call);
  }

  return unique;
}

import type { RetellSessionRow } from "./supabase.js";

export type RetellPayload = Record<string, unknown>;

const FIELD_ALIASES: Record<keyof Omit<RetellSessionRow, "id" | "created_at" | "updated_at" | "raw_payload">, string[]> = {
  session_time: ["time", "Time", "session_time", "sessionTime", "call_time", "callTime"],
  duration_seconds: ["duration", "Duration", "duration_seconds", "durationSeconds", "call_duration", "callDuration"],
  channel_type: ["channelType", "Channel Type", "channel_type", "channel"],
  cost: ["cost", "Cost", "call_cost", "callCost"],
  session_id: ["sessionId", "Session ID", "session_id", "call_id", "callId", "id"],
  end_reason: ["endReason", "End Reason", "end_reason", "disconnection_reason", "disconnectionReason"],
  session_status: ["sessionStatus", "Session Status", "session_status", "call_status", "callStatus", "status"],
  user_sentiment: ["userSentiment", "User Sentiment", "user_sentiment", "sentiment"],
  agent_id: ["agentId", "Agent ID", "agent_id"],
  agent_version: ["agentVersion", "Agent Version", "agent_version"],
  agent_name: ["agentName", "Agent Name", "agent_name"],
  from_number: ["from", "From", "from_number", "fromNumber", "caller_number", "callerNumber"],
  to_number: ["to", "To", "to_number", "toNumber", "callee_number", "calleeNumber"],
  direction: ["direction", "Direction", "call_direction", "callDirection"],
  session_outcome: ["sessionOutcome", "Session Outcome", "session_outcome", "call_outcome", "callOutcome"],
  end_to_end_latency_ms: ["endToEndLatency", "End to End Latency", "end_to_end_latency_ms", "latency", "Latency", "latency_ms"],
  recording_url: ["recordingUrl", "Recording URL", "recording_url"],
  scrubbed_recording_url: ["scrubbedRecordingUrl", "Scrubbed Recording URL", "scrubbed_recording_url"],
  public_log_url: ["publicLogUrl", "Public Log URL", "public_log_url"],
  transcript: ["transcript", "Transcript"],
  transcript_with_tool_calls: ["transcriptWithToolCalls", "Transcript With Tool Calls", "transcript_with_tool_calls"],
  scrubbed_transcript_with_tool_calls: [
    "scrubbedTranscriptWithToolCalls",
    "Scrubbed Transcript With Tool Calls",
    "scrubbed_transcript_with_tool_calls",
  ],
};

function getNestedValue(obj: RetellPayload, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function findValue(payload: RetellPayload, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (payload[alias] !== undefined && payload[alias] !== null) {
      return payload[alias];
    }
  }

  const nestedPaths = [
    ["call", ...aliases.slice(0, 1)],
    ["data", ...aliases.slice(0, 1)],
    ["session", ...aliases.slice(0, 1)],
  ];

  for (const path of nestedPaths) {
    const value = getNestedValue(payload, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function toStringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toTimestampOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? toStringOrNull(value) : date.toISOString();
}

export function normalizeRetellSession(payload: RetellPayload): RetellSessionRow {
  const sessionId = toStringOrNull(findValue(payload, FIELD_ALIASES.session_id));

  if (!sessionId) {
    throw new Error("session_id is required but was not found in payload");
  }

  const row: RetellSessionRow = {
    session_id: sessionId,
    session_time: toTimestampOrNull(findValue(payload, FIELD_ALIASES.session_time)),
    duration_seconds: toNumberOrNull(findValue(payload, FIELD_ALIASES.duration_seconds)),
    channel_type: toStringOrNull(findValue(payload, FIELD_ALIASES.channel_type)),
    cost: toNumberOrNull(findValue(payload, FIELD_ALIASES.cost)),
    end_reason: toStringOrNull(findValue(payload, FIELD_ALIASES.end_reason)),
    session_status: toStringOrNull(findValue(payload, FIELD_ALIASES.session_status)),
    user_sentiment: toStringOrNull(findValue(payload, FIELD_ALIASES.user_sentiment)),
    agent_id: toStringOrNull(findValue(payload, FIELD_ALIASES.agent_id)),
    agent_version: toStringOrNull(findValue(payload, FIELD_ALIASES.agent_version)),
    agent_name: toStringOrNull(findValue(payload, FIELD_ALIASES.agent_name)),
    from_number: toStringOrNull(findValue(payload, FIELD_ALIASES.from_number)),
    to_number: toStringOrNull(findValue(payload, FIELD_ALIASES.to_number)),
    direction: toStringOrNull(findValue(payload, FIELD_ALIASES.direction)),
    session_outcome: toStringOrNull(findValue(payload, FIELD_ALIASES.session_outcome)),
    end_to_end_latency_ms: toNumberOrNull(findValue(payload, FIELD_ALIASES.end_to_end_latency_ms)),
    recording_url: toStringOrNull(findValue(payload, FIELD_ALIASES.recording_url)),
    scrubbed_recording_url: toStringOrNull(findValue(payload, FIELD_ALIASES.scrubbed_recording_url)),
    public_log_url: toStringOrNull(findValue(payload, FIELD_ALIASES.public_log_url)),
    transcript: toStringOrNull(findValue(payload, FIELD_ALIASES.transcript)),
    transcript_with_tool_calls: toStringOrNull(findValue(payload, FIELD_ALIASES.transcript_with_tool_calls)),
    scrubbed_transcript_with_tool_calls: toStringOrNull(
      findValue(payload, FIELD_ALIASES.scrubbed_transcript_with_tool_calls)
    ),
    raw_payload: payload,
  };

  return row;
}

export interface LogRetellSessionInput {
  time?: string;
  duration?: number | string;
  channelType?: string;
  cost?: number | string;
  sessionId?: string;
  endReason?: string;
  sessionStatus?: string;
  userSentiment?: string;
  agentId?: string;
  agentVersion?: string;
  agentName?: string;
  from?: string;
  to?: string;
  direction?: string;
  sessionOutcome?: string;
  endToEndLatency?: number | string;
  recordingUrl?: string;
  scrubbedRecordingUrl?: string;
  publicLogUrl?: string;
  transcript?: string;
  transcriptWithToolCalls?: string;
  scrubbedTranscriptWithToolCalls?: string;
  rawPayload?: RetellPayload;
}

export function logRetellSessionInputToPayload(input: LogRetellSessionInput): RetellPayload {
  return {
    time: input.time,
    duration: input.duration,
    channelType: input.channelType,
    cost: input.cost,
    sessionId: input.sessionId,
    endReason: input.endReason,
    sessionStatus: input.sessionStatus,
    userSentiment: input.userSentiment,
    agentId: input.agentId,
    agentVersion: input.agentVersion,
    agentName: input.agentName,
    from: input.from,
    to: input.to,
    direction: input.direction,
    sessionOutcome: input.sessionOutcome,
    endToEndLatency: input.endToEndLatency,
    recordingUrl: input.recordingUrl,
    scrubbedRecordingUrl: input.scrubbedRecordingUrl,
    publicLogUrl: input.publicLogUrl,
    transcript: input.transcript,
    transcriptWithToolCalls: input.transcriptWithToolCalls,
    scrubbedTranscriptWithToolCalls: input.scrubbedTranscriptWithToolCalls,
    ...(input.rawPayload ?? {}),
  };
}

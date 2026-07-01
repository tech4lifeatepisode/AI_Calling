export type RetellCallStatus = "registered" | "not_connected" | "ongoing" | "ended" | "error";

export interface RetellCallSummary {
  call_id: string;
  agent_id?: string;
  agent_name?: string;
  agent_version?: number;
  call_status?: RetellCallStatus;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  from_number?: string;
  to_number?: string;
  direction?: string;
  disconnection_reason?: string;
  recording_url?: string;
  scrubbed_recording_url?: string;
  public_log_url?: string;
  metadata?: Record<string, unknown>;
  call_analysis?: {
    user_sentiment?: string;
    call_successful?: boolean;
    call_summary?: string;
  };
  call_cost?: {
    combined_cost?: number;
    total_duration_seconds?: number;
  };
  latency?: {
    e2e?: { p50?: number; p90?: number; p99?: number };
  };
  transcript?: string;
  transcript_with_tool_calls?: string;
  scrubbed_transcript_with_tool_calls?: string;
}

export interface RetellListCallsResponse {
  items: RetellCallSummary[];
  pagination_key?: string;
  has_more?: boolean;
  total?: number;
}

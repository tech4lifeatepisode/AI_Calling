export interface RetellSessionRow {
  id?: string;
  created_at?: string;
  updated_at?: string;
  session_time?: string | null;
  duration_seconds?: number | null;
  channel_type?: string | null;
  cost?: number | null;
  session_id: string;
  end_reason?: string | null;
  session_status?: string | null;
  user_sentiment?: string | null;
  agent_id?: string | null;
  agent_version?: string | null;
  agent_name?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  direction?: string | null;
  session_outcome?: string | null;
  end_to_end_latency_ms?: number | null;
  recording_url?: string | null;
  scrubbed_recording_url?: string | null;
  public_log_url?: string | null;
  transcript?: string | null;
  transcript_with_tool_calls?: string | null;
  scrubbed_transcript_with_tool_calls?: string | null;
  hubspot_deal_id?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

export interface SyncRunRow {
  id?: string;
  created_at?: string;
  completed_at?: string | null;
  sync_type: string;
  status: string;
  deals_processed?: number;
  sessions_upserted?: number;
  sessions_skipped?: number;
  error_count?: number;
  errors?: Array<{ dealId?: string; error: string }> | null;
  metadata?: Record<string, unknown> | null;
}

export interface McpToolCallRow {
  id?: string;
  created_at?: string;
  session_id?: string | null;
  tool_name: string;
  status: string;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  latency_ms?: number | null;
}

export interface TourBookingRow {
  id?: string;
  created_at?: string;
  updated_at?: string;
  session_id?: string | null;
  hubspot_contact_id?: string | null;
  hubspot_deal_id?: string | null;
  guest_first_name?: string | null;
  guest_last_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  tour_type: string;
  timezone?: string;
  requested_day?: string | null;
  requested_time?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
  duration_minutes?: number | null;
  hubspot_slug?: string | null;
  hubspot_meeting_url?: string | null;
  hubspot_calendar_event_id?: string | null;
  hubspot_booking_response?: Record<string, unknown> | null;
  booking_status: string;
  error_message?: string | null;
}

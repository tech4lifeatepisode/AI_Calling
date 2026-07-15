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
  hubspot_contact_id?: string | null;
  hubspot_contact_name?: string | null;
  hubspot_contact_email?: string | null;
  hubspot_contact_phone?: string | null;
  hubspot_deal_name?: string | null;
  hubspot_pipeline?: string | null;
  hubspot_deal_stage?: string | null;
  hubspot_deal_stage_id?: string | null;
  hubspot_unit_type?: string | null;
  hubspot_contract_start_date?: string | null;
  hubspot_contract_end_date?: string | null;
  raw_payload?: Record<string, unknown> | null;
  latest_unit_type_slug?: string | null;
  latest_check_in?: string | null;
  latest_check_out?: string | null;
  latest_stay_nights?: number | null;
  latest_people?: number | null;
  latest_monthly_rate?: number | null;
  latest_precio_mensual_display?: number | null;
  latest_security_deposit?: number | null;
  latest_additional_person_fee?: number | null;
  latest_total_due_now?: number | null;
  latest_total_due_on_docs?: number | null;
  latest_total_rent?: number | null;
  latest_total_price?: number | null;
  latest_pricing_available?: boolean | null;
  latest_stay_kind?: string | null;
  latest_pricing_data_source?: string | null;
  latest_applied_promo?: string | null;
  latest_pricing_quoted_at?: string | null;
  latest_pricing_spoken_summary?: string | null;
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

export interface RoomPricingRequestRow {
  id?: string;
  created_at?: string;
  session_id?: string | null;
  hubspot_deal_id?: string | null;
  hubspot_contact_id?: string | null;
  hubspot_deal_name?: string | null;
  hubspot_contact_name?: string | null;
  hubspot_contact_email?: string | null;
  unit_type_slug?: string | null;
  display_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  nights?: number | null;
  people?: number | null;
  promo_code?: string | null;
  payment_option?: string | null;
  selectable_on_website?: boolean | null;
  available?: boolean | null;
  status: string;
  base_monthly_rate?: number | null;
  precio_mensual_display?: number | null;
  security_deposit?: number | null;
  additional_person_fee?: number | null;
  total_due_now?: number | null;
  total_due_on_docs?: number | null;
  total_rent?: number | null;
  total_price?: number | null;
  stay_kind?: string | null;
  data_source?: string | null;
  applied_promo?: string | null;
  promo_error?: string | null;
  spoken_summary?: string | null;
  request_source?: string | null;
  tool_name?: string | null;
  episode_availability_response?: Record<string, unknown> | null;
  episode_quote_response?: Record<string, unknown> | null;
  error_message?: string | null;
  latency_ms?: number | null;
}

export interface RetellSessionPricingUpdate {
  session_id: string;
  latest_unit_type_slug?: string | null;
  latest_check_in?: string | null;
  latest_check_out?: string | null;
  latest_stay_nights?: number | null;
  latest_people?: number | null;
  latest_monthly_rate?: number | null;
  latest_precio_mensual_display?: number | null;
  latest_security_deposit?: number | null;
  latest_additional_person_fee?: number | null;
  latest_total_due_now?: number | null;
  latest_total_due_on_docs?: number | null;
  latest_total_rent?: number | null;
  latest_total_price?: number | null;
  latest_pricing_available?: boolean | null;
  latest_stay_kind?: string | null;
  latest_pricing_data_source?: string | null;
  latest_applied_promo?: string | null;
  latest_pricing_quoted_at?: string | null;
  latest_pricing_spoken_summary?: string | null;
}

-- Retell HubSpot MCP Server schema
-- Run this in the Supabase SQL editor before deploying.

-- A. retell_sessions
CREATE TABLE IF NOT EXISTS retell_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  session_time timestamptz NULL,
  duration_seconds numeric NULL,
  channel_type text NULL,
  cost numeric NULL,
  session_id text UNIQUE NOT NULL,
  end_reason text NULL,
  session_status text NULL,
  user_sentiment text NULL,
  agent_id text NULL,
  agent_version text NULL,
  agent_name text NULL,
  from_number text NULL,
  to_number text NULL,
  direction text NULL,
  session_outcome text NULL,
  end_to_end_latency_ms numeric NULL,
  recording_url text NULL,
  scrubbed_recording_url text NULL,
  public_log_url text NULL,
  transcript text NULL,
  transcript_with_tool_calls text NULL,
  scrubbed_transcript_with_tool_calls text NULL,
  hubspot_deal_id text NULL,
  hubspot_contact_id text NULL,
  hubspot_contact_name text NULL,
  hubspot_contact_email text NULL,
  hubspot_contact_phone text NULL,
  hubspot_deal_name text NULL,
  hubspot_pipeline text NULL,
  hubspot_deal_stage text NULL,
  hubspot_deal_stage_id text NULL,
  hubspot_unit_type text NULL,
  hubspot_contract_start_date timestamptz NULL,
  hubspot_contract_end_date timestamptz NULL,
  raw_payload jsonb NULL,
  latest_unit_type_slug text NULL,
  latest_check_in date NULL,
  latest_check_out date NULL,
  latest_stay_nights integer NULL,
  latest_people integer NULL,
  latest_monthly_rate numeric NULL,
  latest_precio_mensual_display numeric NULL,
  latest_security_deposit numeric NULL,
  latest_additional_person_fee numeric NULL,
  latest_total_due_now numeric NULL,
  latest_total_due_on_docs numeric NULL,
  latest_total_rent numeric NULL,
  latest_total_price numeric NULL,
  latest_pricing_available boolean NULL,
  latest_stay_kind text NULL,
  latest_pricing_data_source text NULL,
  latest_applied_promo text NULL,
  latest_pricing_quoted_at timestamptz NULL,
  latest_pricing_spoken_summary text NULL
);

CREATE INDEX IF NOT EXISTS idx_retell_sessions_session_id ON retell_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_retell_sessions_hubspot_deal_id ON retell_sessions (hubspot_deal_id);
CREATE INDEX IF NOT EXISTS idx_retell_sessions_hubspot_contact_id ON retell_sessions (hubspot_contact_id);

-- B. mcp_tool_calls
CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NULL,
  tool_name text NOT NULL,
  status text NOT NULL,
  request_payload jsonb NULL,
  response_payload jsonb NULL,
  error_message text NULL,
  latency_ms numeric NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_session_id ON mcp_tool_calls (session_id);

-- C. tour_bookings
CREATE TABLE IF NOT EXISTS tour_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  session_id text NULL,
  hubspot_contact_id text NULL,
  hubspot_deal_id text NULL,
  guest_first_name text NULL,
  guest_last_name text NULL,
  guest_email text NULL,
  guest_phone text NULL,
  tour_type text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Madrid',
  requested_day text NULL,
  requested_time text NULL,
  scheduled_start_time timestamptz NULL,
  scheduled_end_time timestamptz NULL,
  duration_minutes integer NULL,
  hubspot_slug text NULL,
  hubspot_meeting_url text NULL,
  hubspot_calendar_event_id text NULL,
  hubspot_booking_response jsonb NULL,
  booking_status text NOT NULL,
  error_message text NULL
);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_session_id ON tour_bookings (session_id);
CREATE INDEX IF NOT EXISTS idx_tour_bookings_hubspot_contact_id ON tour_bookings (hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_tour_bookings_hubspot_deal_id ON tour_bookings (hubspot_deal_id);

-- D. sync_runs — audit log for HubSpot deal → Retell call sync jobs
CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  sync_type text NOT NULL,
  status text NOT NULL,
  deals_processed integer NOT NULL DEFAULT 0,
  sessions_upserted integer NOT NULL DEFAULT 0,
  sessions_skipped integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  errors jsonb NULL,
  metadata jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_created_at ON sync_runs (created_at DESC);

-- E. room_pricing_requests — audit log for every pricing quote request
CREATE TABLE IF NOT EXISTS room_pricing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NULL,
  hubspot_deal_id text NULL,
  hubspot_contact_id text NULL,
  hubspot_deal_name text NULL,
  hubspot_contact_name text NULL,
  hubspot_contact_email text NULL,
  unit_type_slug text NULL,
  display_name text NULL,
  check_in date NULL,
  check_out date NULL,
  nights integer NULL,
  people integer NULL,
  promo_code text NULL,
  payment_option text NULL,
  selectable_on_website boolean NULL,
  available boolean NULL,
  status text NOT NULL,
  base_monthly_rate numeric NULL,
  precio_mensual_display numeric NULL,
  security_deposit numeric NULL,
  additional_person_fee numeric NULL,
  total_due_now numeric NULL,
  total_due_on_docs numeric NULL,
  total_rent numeric NULL,
  total_price numeric NULL,
  stay_kind text NULL,
  data_source text NULL,
  applied_promo text NULL,
  promo_error text NULL,
  spoken_summary text NULL,
  request_source text NULL,
  tool_name text NULL,
  episode_availability_response jsonb NULL,
  episode_quote_response jsonb NULL,
  error_message text NULL,
  latency_ms numeric NULL
);

CREATE INDEX IF NOT EXISTS idx_room_pricing_requests_session_id ON room_pricing_requests (session_id);
CREATE INDEX IF NOT EXISTS idx_room_pricing_requests_hubspot_deal_id ON room_pricing_requests (hubspot_deal_id);
CREATE INDEX IF NOT EXISTS idx_room_pricing_requests_created_at ON room_pricing_requests (created_at DESC);

-- Auto-update updated_at on retell_sessions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS retell_sessions_updated_at ON retell_sessions;
CREATE TRIGGER retell_sessions_updated_at
  BEFORE UPDATE ON retell_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tour_bookings_updated_at ON tour_bookings;
CREATE TRIGGER tour_bookings_updated_at
  BEFORE UPDATE ON tour_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

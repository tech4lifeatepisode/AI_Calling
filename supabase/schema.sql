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
  raw_payload jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_retell_sessions_session_id ON retell_sessions (session_id);

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

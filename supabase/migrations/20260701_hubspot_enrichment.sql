-- HubSpot CRM enrichment columns on retell_sessions
ALTER TABLE retell_sessions
  ADD COLUMN IF NOT EXISTS hubspot_contact_id text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_contact_name text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_contact_email text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_contact_phone text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_deal_name text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_pipeline text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_deal_stage text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_deal_stage_id text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_unit_type text NULL,
  ADD COLUMN IF NOT EXISTS hubspot_contract_start_date timestamptz NULL,
  ADD COLUMN IF NOT EXISTS hubspot_contract_end_date timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_retell_sessions_hubspot_contact_id
  ON retell_sessions (hubspot_contact_id);

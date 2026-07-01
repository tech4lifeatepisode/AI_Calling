-- Migration: add call sync columns/tables for existing deployments.
-- Safe to run multiple times.

ALTER TABLE retell_sessions
  ADD COLUMN IF NOT EXISTS hubspot_deal_id text NULL;

CREATE INDEX IF NOT EXISTS idx_retell_sessions_hubspot_deal_id
  ON retell_sessions (hubspot_deal_id);

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

-- Cursor and per-row errors for the retell_sessions → Notion sync.
-- Run this in the Supabase SQL editor before deploying the hardened sync.

CREATE TABLE IF NOT EXISTS sync_state (
  name text PRIMARY KEY,
  cursor timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb
);

CREATE TABLE IF NOT EXISTS sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_name text NOT NULL DEFAULT 'notion_retell_sessions',
  session_id text NOT NULL,
  error text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (sync_name, session_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_errors_open
  ON sync_errors (sync_name)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_retell_sessions_updated_at
  ON retell_sessions (updated_at);

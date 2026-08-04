CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS application_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  request_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS application_audit_occurred_at_idx
  ON application_audit (occurred_at DESC);

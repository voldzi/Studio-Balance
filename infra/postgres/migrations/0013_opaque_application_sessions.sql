-- Browser cookies contain only a random opaque session identifier. Refresh tokens
-- are encrypted at rest by the API before being persisted here.
CREATE TABLE application_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('web', 'admin')),
  oidc_subject text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL,
  first_name text,
  last_name text,
  roles text[] NOT NULL DEFAULT '{}',
  refresh_token_ciphertext text,
  absolute_expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  last_revalidated_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_sessions_absolute_expiry CHECK (absolute_expires_at > created_at),
  CONSTRAINT application_sessions_idle_before_absolute CHECK (idle_expires_at <= absolute_expires_at)
);

CREATE INDEX application_sessions_active_lookup_idx
  ON application_sessions (token_hash, kind)
  WHERE revoked_at IS NULL;

CREATE INDEX application_sessions_expiry_idx
  ON application_sessions (absolute_expires_at, idle_expires_at)
  WHERE revoked_at IS NULL;

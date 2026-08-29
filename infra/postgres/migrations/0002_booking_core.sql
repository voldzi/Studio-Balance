CREATE TABLE user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_subject text NOT NULL UNIQUE,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  first_name text,
  last_name text,
  phone text,
  terms_version text,
  terms_accepted_at timestamptz,
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((terms_version IS NULL) = (terms_accepted_at IS NULL)),
  CHECK ((marketing_consent = false) OR (marketing_consent_at IS NOT NULL))
);

CREATE UNIQUE INDEX user_profiles_email_lower_idx ON user_profiles (lower(email));

CREATE TABLE instructors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE class_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text NOT NULL,
  description text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 240),
  arrival_lead_minutes integer NOT NULL DEFAULT 10 CHECK (arrival_lead_minutes BETWEEN 0 AND 120),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type_id uuid NOT NULL REFERENCES class_types(id),
  instructor_id uuid NOT NULL REFERENCES instructors(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  time_zone text NOT NULL DEFAULT 'Europe/Prague' CHECK (time_zone = 'Europe/Prague'),
  arrival_lead_minutes integer NOT NULL DEFAULT 10 CHECK (arrival_lead_minutes BETWEEN 0 AND 120),
  location_name text NOT NULL,
  location_address text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'CZK' CHECK (currency = 'CZK'),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  booking_opens_at timestamptz NOT NULL,
  booking_closes_at timestamptz NOT NULL,
  free_cancellation_until timestamptz,
  equipment text NOT NULL DEFAULT '',
  suitability text NOT NULL DEFAULT '',
  change_notice text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CHECK (booking_opens_at < booking_closes_at),
  CHECK (booking_closes_at <= start_at)
);

CREATE INDEX class_sessions_start_at_idx ON class_sessions (start_at);
CREATE INDEX class_sessions_public_schedule_idx ON class_sessions (status, start_at);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  session_id uuid NOT NULL REFERENCES class_sessions(id),
  status text NOT NULL DEFAULT 'reserved' CHECK (
    status IN (
      'reserved',
      'cancelled_on_time',
      'cancelled_late',
      'attended',
      'no_show',
      'cancelled_by_studio'
    )
  ),
  source text NOT NULL CHECK (source IN ('web', 'admin')),
  price_snapshot_cents integer NOT NULL CHECK (price_snapshot_cents >= 0),
  currency text NOT NULL DEFAULT 'CZK' CHECK (currency = 'CZK'),
  terms_version text NOT NULL,
  cancellation_cutoff_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bookings_one_active_per_user_session_idx
  ON bookings (user_id, session_id)
  WHERE status = 'reserved';
CREATE INDEX bookings_session_status_idx ON bookings (session_id, status);
CREATE INDEX bookings_user_created_idx ON bookings (user_id, created_at DESC);

CREATE TABLE booking_idempotency (
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE TABLE cancellation_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'CZK' CHECK (currency = 'CZK'),
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'settled', 'waived', 'cancelled')),
  settlement_method text CHECK (settlement_method IN ('cash', 'terminal')),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'settled') = (settled_at IS NOT NULL)),
  CHECK ((status = 'settled') OR (settlement_method IS NULL))
);

CREATE TABLE account_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  booking_id uuid REFERENCES bookings(id),
  kind text NOT NULL CHECK (kind IN ('booking_confirmed', 'booking_cancelled', 'session_changed', 'session_cancelled')),
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_notifications_user_created_idx
  ON account_notifications (user_id, created_at DESC);

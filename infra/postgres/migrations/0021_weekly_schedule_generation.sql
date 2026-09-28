-- CD-055: retain the confirmed weekly schedule independently of dated sessions.
-- Existing dated sessions, including cancellations and booked prices, stay intact.
CREATE TABLE weekly_schedule_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type_id uuid NOT NULL REFERENCES class_types(id),
  instructor_id uuid NOT NULL REFERENCES instructors(id),
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  local_start_time time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
  arrival_lead_minutes integer NOT NULL CHECK (arrival_lead_minutes BETWEEN 0 AND 120),
  location_name text NOT NULL,
  location_address text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  booking_lead_days integer NOT NULL DEFAULT 30 CHECK (booking_lead_days BETWEEN 1 AND 93),
  equipment text NOT NULL DEFAULT '',
  suitability text NOT NULL DEFAULT '',
  generate_from date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_type_id, weekday)
);

ALTER TABLE class_sessions
  ADD COLUMN weekly_rule_id uuid REFERENCES weekly_schedule_rules(id),
  ADD COLUMN weekly_occurrence_date date,
  ADD CONSTRAINT class_sessions_weekly_origin_pair CHECK (
    (weekly_rule_id IS NULL) = (weekly_occurrence_date IS NULL)
  );
CREATE UNIQUE INDEX class_sessions_weekly_occurrence_unique
  ON class_sessions (weekly_rule_id, weekly_occurrence_date)
  WHERE weekly_rule_id IS NOT NULL;

-- The confirmed, manually published opening horizon ends on 28 October.
-- The worker skips any matching manual or cancelled session in its own range.
WITH slots(slug, instructor_id, weekday, local_start_time, price_cents, capacity) AS (
  VALUES
    ('trx', '10000000-0000-4000-8000-000000000001'::uuid, 1, '17:00'::time, 16000, 8),
    ('balance-flow', '10000000-0000-4000-8000-000000000001'::uuid, 1, '18:10'::time, 20000, 10),
    ('barre', '10000000-0000-4000-8000-000000000001'::uuid, 2, '17:00'::time, 27000, 10),
    ('kruhovy-trenink', '10000000-0000-4000-8000-000000000004'::uuid, 2, '18:15'::time, 16000, 16),
    ('barre', '10000000-0000-4000-8000-000000000005'::uuid, 3, '08:00'::time, 27000, 10),
    ('trx', '10000000-0000-4000-8000-000000000001'::uuid, 3, '16:00'::time, 16000, 8),
    ('jumping', '10000000-0000-4000-8000-000000000001'::uuid, 3, '17:15'::time, 16000, 16),
    ('balance-flow', '10000000-0000-4000-8000-000000000001'::uuid, 4, '17:00'::time, 20000, 10),
    ('kruhovy-trenink', '10000000-0000-4000-8000-000000000004'::uuid, 4, '18:15'::time, 16000, 16),
    ('power-joga', '10000000-0000-4000-8000-000000000006'::uuid, 5, '17:30'::time, 16000, 16),
    ('jumping', '10000000-0000-4000-8000-000000000007'::uuid, 7, '16:00'::time, 16000, 16),
    ('power-joga', '10000000-0000-4000-8000-000000000006'::uuid, 7, '18:00'::time, 16000, 16)
)
INSERT INTO weekly_schedule_rules (
  class_type_id, instructor_id, weekday, local_start_time, duration_minutes,
  arrival_lead_minutes, location_name, location_address, price_cents, capacity,
  equipment, suitability, generate_from
)
SELECT ct.id, slots.instructor_id, slots.weekday, slots.local_start_time,
  ct.duration_minutes, ct.arrival_lead_minutes, 'Studio Balance',
  'Ruská 10, 792 01 Bruntál', slots.price_cents, slots.capacity,
  ct.default_equipment, concat_ws(' ', ct.audience, ct.practical_notice),
  '2026-10-29'::date
FROM slots
JOIN class_types ct ON ct.slug = slots.slug
JOIN instructors instructor ON instructor.id = slots.instructor_id;

DO $$ BEGIN
  IF (SELECT count(*) FROM weekly_schedule_rules) <> 12 THEN
    RAISE EXCEPTION 'The confirmed weekly schedule could not be seeded completely';
  END IF;
END $$;

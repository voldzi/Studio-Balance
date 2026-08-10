-- The client confirmed that TRX remains CZK 160 and every other lesson costs
-- CZK 299. Publish the complete fixed schedule inside the current 30-day
-- booking horizon. Nicola is the only confirmed production instructor record;
-- individual instructor assignments remain editable in administration.
UPDATE class_sessions
SET
  price_cents = CASE
    WHEN class_type_id = '20000000-0000-4000-8000-000000000002'::uuid THEN 16000
    ELSE 29900
  END,
  updated_at = now()
WHERE start_at >= '2026-08-10 00:00:00 Europe/Prague'::timestamptz
  AND status = 'scheduled';

WITH weekly_schedule(day_of_week, start_time, class_slug, capacity) AS (
  VALUES
    (1, '17:00'::time, 'trx', 8),
    (1, '18:10'::time, 'balance-flow', 10),
    (2, '17:00'::time, 'barre', 10),
    (2, '18:15'::time, 'kruhovy-trenink', 16),
    (3, '16:00'::time, 'trx', 8),
    (3, '17:15'::time, 'jumping', 16),
    (4, '08:30'::time, 'barre-strength', 10),
    (4, '17:00'::time, 'balance-flow', 10),
    (4, '18:15'::time, 'kruhovy-trenink', 16),
    (5, '17:30'::time, 'power-joga', 16),
    (7, '16:00'::time, 'jumping', 16),
    (7, '18:00'::time, 'power-joga', 16)
),
service_dates AS (
  SELECT day_value::date AS service_date
  FROM generate_series(
    '2026-08-10'::date,
    '2026-09-09'::date,
    interval '1 day'
  ) AS generated(day_value)
),
planned_sessions AS (
  SELECT
    class_types.id AS class_type_id,
    class_types.duration_minutes,
    class_types.arrival_lead_minutes,
    class_types.default_equipment,
    class_types.what_to_bring,
    class_types.audience,
    class_types.practical_notice,
    weekly_schedule.capacity,
    ((service_dates.service_date + weekly_schedule.start_time) AT TIME ZONE 'Europe/Prague') AS start_at,
    CASE WHEN weekly_schedule.class_slug = 'trx' THEN 16000 ELSE 29900 END AS price_cents
  FROM service_dates
  JOIN weekly_schedule
    ON weekly_schedule.day_of_week = extract(isodow FROM service_dates.service_date)::integer
  JOIN class_types
    ON class_types.slug = weekly_schedule.class_slug
)
INSERT INTO class_sessions (
  id, class_type_id, instructor_id, start_at, end_at,
  arrival_lead_minutes, location_name, location_address, price_cents, capacity,
  booking_opens_at, booking_closes_at, equipment, suitability
)
SELECT
  gen_random_uuid(),
  planned_sessions.class_type_id,
  '10000000-0000-4000-8000-000000000001'::uuid,
  planned_sessions.start_at,
  planned_sessions.start_at + make_interval(mins => planned_sessions.duration_minutes),
  planned_sessions.arrival_lead_minutes,
  'Studio Balance',
  'Ruská 10, 792 01 Bruntál',
  planned_sessions.price_cents,
  planned_sessions.capacity,
  planned_sessions.start_at - interval '30 days',
  planned_sessions.start_at - interval '30 minutes',
  concat_ws(' ', planned_sessions.default_equipment, planned_sessions.what_to_bring),
  concat_ws(' ', planned_sessions.audience, planned_sessions.practical_notice)
FROM planned_sessions
WHERE NOT EXISTS (
  SELECT 1
  FROM class_sessions existing
  WHERE existing.class_type_id = planned_sessions.class_type_id
    AND existing.start_at = planned_sessions.start_at
);

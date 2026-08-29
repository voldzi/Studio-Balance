-- Client correction received on 2026-08-10: Barre costs CZK 250; TRX,
-- Balance Flow, circuit training, Jumping and Power Yoga cost CZK 160.
-- The same correction confirms the instructor for every weekly slot.
INSERT INTO instructors (id, display_name, bio, sort_order)
VALUES
  ('10000000-0000-4000-8000-000000000004', 'Tereza', 'Lektorka kruhového tréninku ve Studio Balance.', 40),
  ('10000000-0000-4000-8000-000000000005', 'Katka', 'Lektorka Barre Strength ve Studio Balance.', 50),
  ('10000000-0000-4000-8000-000000000006', 'Helka', 'Lektorka Power Yoga ve Studio Balance.', 60),
  ('10000000-0000-4000-8000-000000000007', 'Monika', 'Lektorka nedělního Jumpingu ve Studio Balance.', 70)
ON CONFLICT (id) DO UPDATE SET
  display_name = excluded.display_name,
  bio = excluded.bio,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

WITH confirmed_slots(day_of_week, start_time, class_slug, instructor_id, price_cents) AS (
  VALUES
    (1, '17:00'::time, 'trx', '10000000-0000-4000-8000-000000000001'::uuid, 16000),
    (1, '18:10'::time, 'balance-flow', '10000000-0000-4000-8000-000000000001'::uuid, 16000),
    (2, '17:00'::time, 'barre', '10000000-0000-4000-8000-000000000001'::uuid, 25000),
    (2, '18:15'::time, 'kruhovy-trenink', '10000000-0000-4000-8000-000000000004'::uuid, 16000),
    (3, '16:00'::time, 'trx', '10000000-0000-4000-8000-000000000001'::uuid, 16000),
    (3, '17:15'::time, 'jumping', '10000000-0000-4000-8000-000000000001'::uuid, 16000),
    (4, '08:30'::time, 'barre-strength', '10000000-0000-4000-8000-000000000005'::uuid, 25000),
    (4, '17:00'::time, 'balance-flow', '10000000-0000-4000-8000-000000000001'::uuid, 16000),
    (4, '18:15'::time, 'kruhovy-trenink', '10000000-0000-4000-8000-000000000004'::uuid, 16000),
    (5, '17:30'::time, 'power-joga', '10000000-0000-4000-8000-000000000006'::uuid, 16000),
    (7, '16:00'::time, 'jumping', '10000000-0000-4000-8000-000000000007'::uuid, 16000),
    (7, '18:00'::time, 'power-joga', '10000000-0000-4000-8000-000000000006'::uuid, 16000)
),
matched_sessions AS (
  SELECT
    class_sessions.id,
    confirmed_slots.instructor_id,
    confirmed_slots.price_cents
  FROM class_sessions
  JOIN class_types ON class_types.id = class_sessions.class_type_id
  JOIN confirmed_slots
    ON confirmed_slots.class_slug = class_types.slug
    AND confirmed_slots.day_of_week = extract(
      isodow FROM class_sessions.start_at AT TIME ZONE 'Europe/Prague'
    )::integer
    AND confirmed_slots.start_time = (class_sessions.start_at AT TIME ZONE 'Europe/Prague')::time
  WHERE class_sessions.start_at >= '2026-08-10 00:00:00 Europe/Prague'::timestamptz
    AND class_sessions.start_at < '2026-09-10 00:00:00 Europe/Prague'::timestamptz
    AND class_sessions.status = 'scheduled'
)
UPDATE class_sessions
SET
  instructor_id = matched_sessions.instructor_id,
  price_cents = matched_sessions.price_cents,
  updated_at = now()
FROM matched_sessions
WHERE class_sessions.id = matched_sessions.id;

-- Confirmed client-facing names, instructors and prices received on 2026-08-13.
-- Existing bookings keep their immutable price snapshots.
INSERT INTO instructors (id, display_name, bio, active, sort_order)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Nicola Lojšková', 'Zakladatelka Studio Balance a lektorka TRX, Jumpingu, Barre Sculpt a Balance Flow.', true, 10),
  ('10000000-0000-4000-8000-000000000004', 'Tereza Sitková', 'Lektorka kruhového tréninku ve Studio Balance.', true, 40),
  ('10000000-0000-4000-8000-000000000005', 'Katka Adamovská', 'Lektorka ranního Barre Strength ve Studio Balance.', true, 50),
  ('10000000-0000-4000-8000-000000000006', 'Xavier Tihelka', 'Lektor Power jógy ve Studio Balance.', true, 60),
  ('10000000-0000-4000-8000-000000000007', 'Monika Kubincová', 'Lektorka nedělního Jumpingu ve Studio Balance.', true, 70)
ON CONFLICT (id) DO UPDATE SET
  display_name = excluded.display_name,
  bio = excluded.bio,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

WITH confirmed_slots(day_of_week, start_time, class_slug, instructor_id, price_cents) AS (
  VALUES
    (1, '17:00'::time, 'trx', '10000000-0000-4000-8000-000000000001'::uuid, 16000),
    (1, '18:10'::time, 'balance-flow', '10000000-0000-4000-8000-000000000001'::uuid, 20000),
    (2, '17:00'::time, 'barre', '10000000-0000-4000-8000-000000000001'::uuid, 25000),
    (2, '18:15'::time, 'kruhovy-trenink', '10000000-0000-4000-8000-000000000004'::uuid, 16000),
    (3, '16:00'::time, 'trx', '10000000-0000-4000-8000-000000000001'::uuid, 16000),
    (3, '17:15'::time, 'jumping', '10000000-0000-4000-8000-000000000001'::uuid, 16000),
    (4, '08:30'::time, 'barre-strength', '10000000-0000-4000-8000-000000000005'::uuid, 25000),
    (4, '17:00'::time, 'balance-flow', '10000000-0000-4000-8000-000000000001'::uuid, 20000),
    (4, '18:15'::time, 'kruhovy-trenink', '10000000-0000-4000-8000-000000000004'::uuid, 16000),
    (5, '17:30'::time, 'power-joga', '10000000-0000-4000-8000-000000000006'::uuid, 16000),
    (7, '16:00'::time, 'jumping', '10000000-0000-4000-8000-000000000007'::uuid, 16000),
    (7, '18:00'::time, 'power-joga', '10000000-0000-4000-8000-000000000006'::uuid, 16000)
)
UPDATE class_sessions AS session
SET instructor_id = slot.instructor_id, price_cents = slot.price_cents, updated_at = now()
FROM class_types AS class_type, confirmed_slots AS slot
WHERE session.class_type_id = class_type.id
  AND slot.class_slug = class_type.slug
  AND slot.day_of_week = extract(isodow FROM session.start_at AT TIME ZONE 'Europe/Prague')::integer
  AND slot.start_time = (session.start_at AT TIME ZONE 'Europe/Prague')::time
  AND session.start_at >= '2026-08-13 00:00:00 Europe/Prague'::timestamptz
  AND session.status = 'scheduled';

CREATE TABLE favorite_class_types (
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  class_type_id uuid NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, class_type_id)
);

CREATE INDEX favorite_class_types_user_order_idx
  ON favorite_class_types (user_id, created_at DESC);

CREATE TABLE studio_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 400),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 5000),
  published boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_news_publication_date CHECK (NOT published OR published_at IS NOT NULL),
  CONSTRAINT studio_news_feature_requires_publication CHECK (NOT featured OR published)
);

CREATE INDEX studio_news_public_order_idx
  ON studio_news (featured DESC, sort_order, published_at DESC)
  WHERE published = true;

-- Client correction received on 2026-08-11: Balance Flow (Balance Flow Board)
-- costs CZK 200. Update only future scheduled sessions. Existing bookings keep
-- their own immutable price snapshot for cancellation-fee correctness.
UPDATE class_sessions AS session
SET
  price_cents = 20000,
  updated_at = now()
FROM class_types AS class_type
WHERE session.class_type_id = class_type.id
  AND class_type.slug = 'balance-flow'
  AND session.start_at >= '2026-08-11 00:00:00 Europe/Prague'::timestamptz
  AND session.status = 'scheduled';

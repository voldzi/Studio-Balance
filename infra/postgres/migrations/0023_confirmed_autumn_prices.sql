-- CD-057: a one-time, client-approved correction of active future Barre
-- booking prices, and the new Balance Flow price for future bookings.
-- Run under the migration transaction so no concurrent booking can observe
-- a partially changed session and booking price.
LOCK TABLE class_sessions, bookings, cancellation_fees IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE barre_booking_price_changes ON COMMIT DROP AS
SELECT booking.id, booking.user_id, booking.price_snapshot_cents AS old_price_cents
FROM bookings AS booking
JOIN class_sessions AS session ON session.id = booking.session_id
JOIN class_types AS type ON type.id = session.class_type_id
WHERE type.slug = 'barre'
  AND session.start_at > now()
  AND booking.status = 'reserved'
  AND booking.price_snapshot_cents <> 27000;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM cancellation_fees AS fee
    JOIN barre_booking_price_changes AS changed ON changed.id = fee.booking_id
    WHERE fee.status IN ('due', 'settled')
  ) THEN
    RAISE EXCEPTION 'Cannot change a Barre booking price with an active or settled fee';
  END IF;
END $$;

UPDATE bookings AS booking
SET price_snapshot_cents = 27000, updated_at = now()
FROM barre_booking_price_changes AS changed
WHERE booking.id = changed.id;

INSERT INTO application_audit
  (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'cd-057', 'booking.price_corrected', 'booking', changed.id,
  'barre-booking-price-270',
  jsonb_build_object('oldPriceCents', changed.old_price_cents, 'newPriceCents', 27000)
FROM barre_booking_price_changes AS changed;

INSERT INTO account_notifications (user_id, booking_id, kind, title, body)
SELECT changed.user_id, changed.id, 'session_changed', 'Změna ceny lekce Barre',
  'Cena vaší rezervace Barre byla upravena na 270 Kč. Termín a vaše místo zůstávají beze změny.'
FROM barre_booking_price_changes AS changed;

UPDATE weekly_schedule_rules AS rule
SET price_cents = 16000, updated_at = now()
FROM class_types AS type
WHERE type.id = rule.class_type_id AND type.slug = 'balance-flow'
  AND rule.price_cents <> 16000;

WITH candidates AS MATERIALIZED (
  SELECT session.id, session.price_cents AS old_price_cents
  FROM class_sessions AS session
  JOIN class_types AS type ON type.id = session.class_type_id
  WHERE type.slug = 'balance-flow' AND session.start_at > now()
    AND session.status = 'scheduled' AND session.price_cents <> 16000
  FOR UPDATE OF session
), changed AS (
  UPDATE class_sessions AS session
  SET price_cents = 16000, updated_at = now()
  FROM candidates
  WHERE session.id = candidates.id
  RETURNING session.id, candidates.old_price_cents
)
INSERT INTO application_audit
  (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'cd-057', 'session.price_changed', 'session', changed.id,
  'balance-flow-price-160',
  jsonb_build_object('oldPriceCents', changed.old_price_cents, 'newPriceCents', 16000)
FROM changed;

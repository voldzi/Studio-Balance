-- CD-059: keep confirmed places, correct active future Balance Flow bookings
-- to 160 CZK, and set both Barre weekly times and future sessions to 8 places.
-- The migration is idempotent so an audited operational run can precede a
-- later application release without sending duplicate account notices.
LOCK TABLE class_sessions, weekly_schedule_rules, bookings, cancellation_fees IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE balance_flow_price_changes ON COMMIT DROP AS
SELECT booking.id, booking.user_id, booking.price_snapshot_cents AS old_price_cents
FROM bookings AS booking
JOIN class_sessions AS session ON session.id = booking.session_id
JOIN class_types AS type ON type.id = session.class_type_id
WHERE type.slug = 'balance-flow'
  AND session.start_at > now()
  AND session.status = 'scheduled'
  AND booking.status = 'reserved'
  AND booking.price_snapshot_cents <> 16000;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM cancellation_fees AS fee
    JOIN balance_flow_price_changes AS changed ON changed.id = fee.booking_id
    WHERE fee.status IN ('due', 'settled')
  ) THEN
    RAISE EXCEPTION 'Cannot change a Balance Flow booking price with an active or settled fee';
  END IF;
  IF EXISTS (
    SELECT 1 FROM class_sessions AS session
    JOIN class_types AS type ON type.id = session.class_type_id
    JOIN bookings AS booking ON booking.session_id = session.id AND booking.status = 'reserved'
    WHERE type.slug = 'barre' AND session.start_at > now() AND session.status = 'scheduled'
    GROUP BY session.id HAVING count(*) > 8
  ) THEN
    RAISE EXCEPTION 'Cannot reduce Barre capacity below active reservations';
  END IF;
END $$;

UPDATE bookings AS booking
SET price_snapshot_cents = 16000, updated_at = now()
FROM balance_flow_price_changes AS changed
WHERE booking.id = changed.id;

UPDATE booking_idempotency AS idem
SET response_body = jsonb_set(idem.response_body, '{session,price}',
  jsonb_build_object('amount', '160.00', 'currency', 'CZK'), true)
FROM balance_flow_price_changes AS changed
WHERE idem.booking_id = changed.id;

INSERT INTO application_audit
  (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'cd-059', 'booking.price_corrected', 'booking', changed.id,
  'balance-flow-price-160-barre-capacity-8',
  jsonb_build_object('oldPriceCents', changed.old_price_cents,
    'newPriceCents', 16000, 'reason', 'Confirmed by studio owner; reservation retained')
FROM balance_flow_price_changes AS changed;

INSERT INTO account_notifications (user_id, booking_id, kind, title, body)
SELECT changed.user_id, changed.id, 'session_changed', 'Změna ceny lekce Balance Flow',
  'Cena vaší rezervace Balance Flow byla snížena na 160 Kč. Termín a vaše místo zůstávají beze změny.'
FROM balance_flow_price_changes AS changed;

WITH candidates AS MATERIALIZED (
  SELECT rule.id, rule.capacity AS old_capacity
  FROM weekly_schedule_rules AS rule
  JOIN class_types AS type ON type.id = rule.class_type_id
  WHERE type.slug = 'barre' AND rule.capacity <> 8
  FOR UPDATE OF rule
), changed AS (
  UPDATE weekly_schedule_rules AS rule
  SET capacity = 8, updated_at = now()
  FROM candidates WHERE rule.id = candidates.id
  RETURNING rule.id, candidates.old_capacity
)
INSERT INTO application_audit
  (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'cd-059', 'weekly_schedule_rule.capacity_changed',
  'weekly_schedule_rule', changed.id, 'balance-flow-price-160-barre-capacity-8',
  jsonb_build_object('oldCapacity', changed.old_capacity, 'newCapacity', 8)
FROM changed;

WITH candidates AS MATERIALIZED (
  SELECT session.id, session.capacity AS old_capacity
  FROM class_sessions AS session
  JOIN class_types AS type ON type.id = session.class_type_id
  WHERE type.slug = 'barre' AND session.start_at > now()
    AND session.status IN ('scheduled', 'cancelled') AND session.capacity <> 8
  FOR UPDATE OF session
), changed AS (
  UPDATE class_sessions AS session
  SET capacity = 8, updated_at = now()
  FROM candidates WHERE session.id = candidates.id
  RETURNING session.id, candidates.old_capacity
)
INSERT INTO application_audit
  (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'cd-059', 'session.capacity_changed', 'session', changed.id,
  'balance-flow-price-160-barre-capacity-8',
  jsonb_build_object('oldCapacity', changed.old_capacity, 'newCapacity', 8)
FROM changed;

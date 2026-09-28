-- CD-057: cancelled future sessions remain visible in the public schedule.
-- Align their displayed price with the new Balance Flow price without
-- reopening them or changing any booking price snapshot.
WITH candidates AS MATERIALIZED (
  SELECT session.id, session.price_cents AS old_price_cents
  FROM class_sessions AS session
  JOIN class_types AS type ON type.id = session.class_type_id
  WHERE type.slug = 'balance-flow' AND session.start_at > now()
    AND session.status = 'cancelled' AND session.price_cents <> 16000
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
  'balance-flow-cancelled-price-160',
  jsonb_build_object('oldPriceCents', changed.old_price_cents, 'newPriceCents', 16000)
FROM changed;

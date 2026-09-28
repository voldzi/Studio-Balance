-- The new Barre price applies to upcoming sessions. Already confirmed
-- reservations retain their immutable price snapshot and fee basis.
UPDATE weekly_schedule_rules AS rule
SET price_cents = 27000, updated_at = now()
FROM class_types AS type
WHERE rule.class_type_id = type.id AND type.slug = 'barre'
  AND rule.price_cents <> 27000;

WITH candidates AS MATERIALIZED (
  SELECT session.id, session.price_cents AS old_price_cents
  FROM class_sessions AS session
  JOIN class_types AS type ON type.id = session.class_type_id
  WHERE type.slug = 'barre' AND session.start_at >= now()
    AND session.price_cents <> 27000
  FOR UPDATE OF session
), changed AS (
  UPDATE class_sessions AS session
  SET price_cents = 27000, updated_at = now()
  FROM candidates
  WHERE session.id = candidates.id
  RETURNING session.id, candidates.old_price_cents, session.price_cents
)
INSERT INTO application_audit
  (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'cd-056', 'session.price_changed', 'session', changed.id,
  'barre-price-270', jsonb_build_object('oldPriceCents', changed.old_price_cents, 'newPriceCents', changed.price_cents)
FROM changed;

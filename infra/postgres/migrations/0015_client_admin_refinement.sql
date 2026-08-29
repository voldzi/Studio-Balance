-- Client-approved cleanup and content policy received on 2026-08-24.
-- Legacy preview instructors are archived rather than deleted so historical
-- sessions keep their referential integrity and truthful audit trail.
UPDATE instructors
SET active = false, updated_at = now()
WHERE id IN (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

-- Clients bring only personal clothing, footwear and a drink. All exercise
-- equipment is supplied by Studio Balance and remains described separately.
UPDATE class_types
SET
  what_to_bring = 'Sportovní oblečení, pohodlnou obuv a pití.',
  updated_at = now();

UPDATE class_sessions AS session
SET
  equipment = class_type.default_equipment,
  updated_at = now()
FROM class_types AS class_type
WHERE session.class_type_id = class_type.id
  AND session.equipment IS DISTINCT FROM class_type.default_equipment;

-- CD-050 follow-up: remove the former public name "Barre Sculpt" from the
-- remaining Barre image description and Nicola's public instructor bio.
UPDATE class_types
SET hero_image_alt = 'Ukázkový vizuál lekce Barre ve Studio Balance.',
    updated_at = now()
WHERE slug = 'barre'
  AND hero_image_alt = 'Ukázkový vizuál lekce Barre Sculpt ve Studio Balance.';

UPDATE instructors
SET bio = 'Zakladatelka Studio Balance a lektorka TRX, Jumpingu, Barre a Balance Flow.',
    updated_at = now()
WHERE id = '10000000-0000-4000-8000-000000000001'::uuid
  AND bio = 'Zakladatelka Studio Balance a lektorka TRX, Jumpingu, Barre Sculpt a Balance Flow.';

INSERT INTO application_audit (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'migration:0020', 'class_type.content_updated', 'class_type', type.id::text, 'CD-050',
       jsonb_build_object('slug', type.slug, 'removedName', 'Barre Sculpt')
FROM class_types type
WHERE type.slug = 'barre'
  AND NOT EXISTS (
    SELECT 1 FROM application_audit audit
    WHERE audit.actor_id = 'migration:0020'
      AND audit.action = 'class_type.content_updated'
      AND audit.entity_id = type.id::text
  );

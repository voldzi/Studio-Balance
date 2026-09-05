-- CD-045: portraits belong to people; catalogue assignments remain available
-- even when no future session is published. Term-specific instructors win.
ALTER TABLE instructors
  ADD COLUMN portrait_asset_id uuid REFERENCES media_assets(id) ON DELETE RESTRICT,
  ADD COLUMN portrait_preview_path text NOT NULL DEFAULT ''
    CHECK (portrait_preview_path = '' OR portrait_preview_path LIKE '/images/studio-balance/team/%');

CREATE TABLE class_type_instructors (
  class_type_id uuid NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  schedule_note text NOT NULL DEFAULT '' CHECK (char_length(schedule_note) <= 160),
  PRIMARY KEY (class_type_id, instructor_id)
);

UPDATE instructors SET portrait_preview_path = '/images/studio-balance/team/' || asset.filename
FROM (VALUES
  ('10000000-0000-4000-8000-000000000001'::uuid, 'nicola-lojskova.webp'),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'tereza-sitkova.webp'),
  ('10000000-0000-4000-8000-000000000005'::uuid, 'katka-adamovska.webp'),
  ('10000000-0000-4000-8000-000000000006'::uuid, 'xavier-tihelka.webp'),
  ('10000000-0000-4000-8000-000000000007'::uuid, 'monika-kubincova.webp')
) AS asset(id, filename)
WHERE instructors.id = asset.id;

INSERT INTO class_type_instructors (class_type_id, instructor_id, schedule_note)
SELECT ct.id, assignment.instructor_id, assignment.schedule_note
FROM (VALUES
  ('barre-strength', '10000000-0000-4000-8000-000000000005'::uuid, 'Středa ráno'),
  ('power-joga', '10000000-0000-4000-8000-000000000006'::uuid, ''),
  ('trx', '10000000-0000-4000-8000-000000000001'::uuid, ''),
  ('jumping', '10000000-0000-4000-8000-000000000001'::uuid, 'Středa'),
  ('barre', '10000000-0000-4000-8000-000000000001'::uuid, ''),
  ('balance-flow', '10000000-0000-4000-8000-000000000001'::uuid, ''),
  ('jumping', '10000000-0000-4000-8000-000000000007'::uuid, 'Neděle'),
  ('kruhovy-trenink', '10000000-0000-4000-8000-000000000004'::uuid, '')
) AS assignment(slug, instructor_id, schedule_note)
JOIN class_types ct ON ct.slug = assignment.slug;

CREATE TABLE studio_team (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  photo_alt text NOT NULL CHECK (char_length(photo_alt) BETWEEN 2 AND 300),
  photo_asset_id uuid REFERENCES media_assets(id) ON DELETE RESTRICT,
  photo_preview_path text NOT NULL DEFAULT ''
    CHECK (photo_preview_path = '' OR photo_preview_path LIKE '/images/studio-balance/team/%'),
  published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO studio_team (title, body, photo_alt, photo_preview_path, published)
VALUES ('Náš tým', 'Poznejte lidi, kteří vás provázejí lekcemi Studia Balance. Vyberte si pohyb podle svého tempa a přijďte si zacvičit s námi.', 'Společná fotografie pěti instruktorů Studia Balance.', '/images/studio-balance/team/studio-balance-team.webp', true);

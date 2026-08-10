-- The fixed client schedule is effective from 2026-08-10. Only TRX has an
-- approved price so far, therefore this migration publishes the TRX slots
-- inside the current 30-day booking horizon without inventing prices for the
-- other lesson types.
INSERT INTO class_sessions (
  id, class_type_id, instructor_id, start_at, end_at,
  arrival_lead_minutes, location_name, location_address, price_cents, capacity,
  booking_opens_at, booking_closes_at, equipment, suitability
)
SELECT
  seed.id,
  '20000000-0000-4000-8000-000000000002'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  seed.start_at,
  seed.start_at + interval '60 minutes',
  10,
  'Studio Balance',
  'Ruská 10, 792 01 Bruntál',
  16000,
  8,
  seed.start_at - interval '30 days',
  seed.start_at - interval '30 minutes',
  'TRX závěsný systém, pohodlné sportovní oblečení, pevná obuv, voda a ručník.',
  'Obtížnost lze přizpůsobit; při zdravotním omezení se před lekcí poraďte s lektorkou.'
FROM (
  VALUES
    ('30000000-0000-4000-8000-000000000009'::uuid, '2026-08-10 17:00:00 Europe/Prague'::timestamptz),
    ('30000000-0000-4000-8000-000000000010'::uuid, '2026-08-12 16:00:00 Europe/Prague'::timestamptz),
    ('30000000-0000-4000-8000-000000000011'::uuid, '2026-08-19 16:00:00 Europe/Prague'::timestamptz),
    ('30000000-0000-4000-8000-000000000012'::uuid, '2026-08-24 17:00:00 Europe/Prague'::timestamptz),
    ('30000000-0000-4000-8000-000000000013'::uuid, '2026-08-26 16:00:00 Europe/Prague'::timestamptz),
    ('30000000-0000-4000-8000-000000000014'::uuid, '2026-08-31 17:00:00 Europe/Prague'::timestamptz),
    ('30000000-0000-4000-8000-000000000015'::uuid, '2026-09-02 16:00:00 Europe/Prague'::timestamptz),
    ('30000000-0000-4000-8000-000000000016'::uuid, '2026-09-07 17:00:00 Europe/Prague'::timestamptz),
    ('30000000-0000-4000-8000-000000000017'::uuid, '2026-09-09 16:00:00 Europe/Prague'::timestamptz)
) AS seed(id, start_at)
WHERE NOT EXISTS (
  SELECT 1
  FROM class_sessions existing
  WHERE existing.class_type_id = '20000000-0000-4000-8000-000000000002'::uuid
    AND existing.start_at = seed.start_at
)
ON CONFLICT (id) DO NOTHING;

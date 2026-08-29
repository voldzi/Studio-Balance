INSERT INTO instructors (id, display_name, bio, sort_order)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Nicola Lojková', 'Zakladatelka Studia Balance a lektorka vědomého pohybu.', 10),
  ('10000000-0000-4000-8000-000000000002', 'Barča', 'Lektorka silových a kondičních lekcí.', 20),
  ('10000000-0000-4000-8000-000000000003', 'Týna', 'Lektorka dynamického pohybu a Balance Flow.', 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO class_types (
  id, slug, name, tagline, description, duration_minutes, arrival_lead_minutes, sort_order
)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'barre', 'Barre', 'Tvarování, postava a elegance', 'Lekce inspirovaná baletem, pilates a funkčním tréninkem. Posiluje hluboké svaly, stabilitu a držení těla.', 60, 10, 10),
  ('20000000-0000-4000-8000-000000000002', 'trx', 'TRX', 'Funkční síla a kontrola', 'Funkční trénink s vlastní vahou, který rozvíjí sílu, stabilitu a koordinaci.', 60, 10, 20),
  ('20000000-0000-4000-8000-000000000003', 'balance-flow', 'Balance Flow', 'Stabilita, mobilita a plynulý pohyb', 'Autorská metoda Studia Balance zaměřená na plynulost pohybu, stabilitu, mobilitu a správné držení těla.', 60, 10, 30),
  ('20000000-0000-4000-8000-000000000004', 'jumping', 'Jumping', 'Zábava, kardio a energie', 'Dynamická lekce na trampolínách, která podporuje kondici, koordinaci a radost z pohybu.', 60, 10, 40),
  ('20000000-0000-4000-8000-000000000005', 'power-joga', 'Power jóga', 'Síla, dech a vnitřní klid', 'Plynulá jógová praxe rozvíjející sílu, flexibilitu, stabilitu a soustředění.', 60, 10, 50),
  ('20000000-0000-4000-8000-000000000006', 'kruhovy-trenink', 'Kruhový trénink', 'Komplexní trénink celého těla', 'Pestrý silově-kondiční trénink v menší skupině s možností přizpůsobit tempo.', 60, 10, 60)
ON CONFLICT (id) DO NOTHING;

INSERT INTO class_sessions (
  id,
  class_type_id,
  instructor_id,
  start_at,
  end_at,
  arrival_lead_minutes,
  location_name,
  location_address,
  price_cents,
  capacity,
  booking_opens_at,
  booking_closes_at,
  equipment,
  suitability
)
SELECT
  seed.id,
  seed.class_type_id,
  seed.instructor_id,
  seed.start_at,
  seed.start_at + interval '60 minutes',
  10,
  'Studio Balance',
  'Ruská 10, 792 01 Bruntál',
  seed.price_cents,
  seed.capacity,
  seed.start_at - interval '30 days',
  seed.start_at - interval '30 minutes',
  'Pohodlné oblečení, láhev s vodou a ručník.',
  'Lekci lze přizpůsobit začátečnicím i pokročilým.'
FROM (
  VALUES
    ('30000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '2026-08-05 08:30:00 Europe/Prague'::timestamptz, 24000, 10),
    ('30000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '2026-08-05 17:00:00 Europe/Prague'::timestamptz, 26000, 10),
    ('30000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000006'::uuid, '10000000-0000-4000-8000-000000000002'::uuid, '2026-08-05 18:15:00 Europe/Prague'::timestamptz, 26000, 10),
    ('30000000-0000-4000-8000-000000000004'::uuid, '20000000-0000-4000-8000-000000000005'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, '2026-08-05 19:30:00 Europe/Prague'::timestamptz, 24000, 10),
    ('30000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, '10000000-0000-4000-8000-000000000002'::uuid, '2026-08-06 17:00:00 Europe/Prague'::timestamptz, 25000, 10),
    ('30000000-0000-4000-8000-000000000006'::uuid, '20000000-0000-4000-8000-000000000004'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, '2026-08-07 18:15:00 Europe/Prague'::timestamptz, 24000, 10),
    ('30000000-0000-4000-8000-000000000007'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '2026-08-08 09:00:00 Europe/Prague'::timestamptz, 26000, 10)
) AS seed(id, class_type_id, instructor_id, start_at, price_cents, capacity)
ON CONFLICT (id) DO NOTHING;

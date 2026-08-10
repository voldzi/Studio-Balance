UPDATE class_types
SET
  name = 'Barre Sculpt',
  tagline = 'Tvarování postavy',
  description = 'Kontrolovaná lekce inspirovaná baletem, pilates a funkčním tréninkem. Zaměřuje se na tvarování postavy, držení těla a přesnost pohybu.',
  difficulty = 3,
  benefits = 'Formuje postavu, podporuje správné držení těla a posiluje hluboké svaly.',
  audience = 'Pro ty, kdo hledají elegantní a soustředěný pohyb s důrazem na techniku a tvarování postavy.',
  suitable_for_beginners = true,
  default_equipment = 'Barre tyč, lehké činky nebo overball podle náplně lekce.',
  what_to_bring = 'Pohodlné oblečení, vodu a případně protiskluzové ponožky.',
  practical_notice = 'Cvičte v rozsahu, který je vám příjemný; při zdravotních omezeních se poraďte s lektorkou.',
  hero_image_path = '/images/studio-balance/lessons/barre.jpeg',
  hero_image_alt = 'Ukázkový vizuál lekce Barre Sculpt ve Studio Balance.',
  seo_title = 'Barre Sculpt | Studio Balance',
  seo_description = 'Barre Sculpt ve Studio Balance: tvarování postavy, elegance a přesný pohyb.',
  updated_at = now()
WHERE id = '20000000-0000-4000-8000-000000000001';

INSERT INTO class_types (
  id, slug, name, tagline, description, duration_minutes,
  arrival_lead_minutes, active, sort_order, difficulty, benefits, audience,
  suitable_for_beginners, default_equipment, what_to_bring, practical_notice,
  hero_image_path, hero_image_alt, seo_title, seo_description
)
VALUES (
  '20000000-0000-4000-8000-000000000007',
  'barre-strength',
  'Barre Strength',
  'Síla a stabilita',
  'Silověji zaměřená varianta Barre, která propojuje kontrolovaný pohyb, stabilitu a posílení celého těla.',
  60,
  10,
  true,
  11,
  3,
  'Rozvíjí sílu, stabilitu, pevný střed těla a kontrolu pohybu.',
  'Pro ty, kdo chtějí principy Barre propojit s výraznějším silovým zaměřením.',
  true,
  'Barre tyč, lehké činky, odporová guma nebo overball podle náplně lekce.',
  'Pohodlné oblečení, vodu a případně protiskluzové ponožky.',
  'Zátěž a rozsah pohybu přizpůsobte svým možnostem a pokynům lektorky.',
  '/images/studio-balance/lessons/barre.jpeg',
  'Ukázkový vizuál lekce Barre Strength ve Studio Balance.',
  'Barre Strength | Studio Balance',
  'Barre Strength ve Studio Balance: síla, stabilita a kontrolovaný pohyb.'
)
ON CONFLICT (id) DO UPDATE SET
  slug = excluded.slug,
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  duration_minutes = excluded.duration_minutes,
  arrival_lead_minutes = excluded.arrival_lead_minutes,
  active = excluded.active,
  sort_order = excluded.sort_order,
  difficulty = excluded.difficulty,
  benefits = excluded.benefits,
  audience = excluded.audience,
  suitable_for_beginners = excluded.suitable_for_beginners,
  default_equipment = excluded.default_equipment,
  what_to_bring = excluded.what_to_bring,
  practical_notice = excluded.practical_notice,
  hero_image_path = excluded.hero_image_path,
  hero_image_alt = excluded.hero_image_alt,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  updated_at = now();

UPDATE class_types
SET
  name = 'Power Yoga',
  hero_image_alt = 'Ukázkový vizuál lekce Power Yoga ve Studio Balance.',
  seo_title = 'Power Yoga | Studio Balance',
  seo_description = 'Power Yoga ve Studio Balance: síla, dech a plynulý pohyb.',
  updated_at = now()
WHERE id = '20000000-0000-4000-8000-000000000005';

INSERT INTO reviews (
  id, author_label, body, reviewed_on, rating, class_type_id,
  consent_confirmed, published, featured, sort_order
)
VALUES (
  '40000000-0000-4000-8000-000000000001',
  'Marketa Šímová',
  'Do tohoto studia chodím na jumping, TRX a lekce zaměřené na posilování břicha a hýždí. Každá lekce je skvěle vedená, vše je srozumitelně vysvětlené a Nikča se věnuje každému tak, aby cvičil správně. Cením si i jejího přístupu – dokáže motivovat a povzbudit i ve chvílích, kdy už člověk nemůže. Díky tomu mě cvičení baví. Ve studiu se člověk cítí příjemně a vítaně, je vidět, že je vše děláno srdcem. Pokud hledáte místo, kde si zacvičíte a zároveň načerpáte energii, mohu jen doporučit. ❤️💪',
  '2026-08-10',
  NULL,
  '20000000-0000-4000-8000-000000000002',
  true,
  true,
  true,
  10
)
ON CONFLICT (id) DO UPDATE SET
  author_label = excluded.author_label,
  body = excluded.body,
  reviewed_on = excluded.reviewed_on,
  rating = excluded.rating,
  class_type_id = excluded.class_type_id,
  consent_confirmed = excluded.consent_confirmed,
  published = excluded.published,
  featured = excluded.featured,
  sort_order = excluded.sort_order,
  updated_at = now();

INSERT INTO class_sessions (
  id, class_type_id, instructor_id, start_at, end_at,
  arrival_lead_minutes, location_name, location_address, price_cents, capacity,
  booking_opens_at, booking_closes_at, equipment, suitability
)
VALUES (
  '30000000-0000-4000-8000-000000000008',
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '2026-08-17 17:00:00 Europe/Prague',
  '2026-08-17 18:00:00 Europe/Prague',
  10,
  'Studio Balance',
  'Ruská 10, 792 01 Bruntál',
  16000,
  8,
  '2026-07-18 17:00:00 Europe/Prague',
  '2026-08-17 16:30:00 Europe/Prague',
  'TRX závěsný systém, pohodlné sportovní oblečení, pevná obuv, voda a ručník.',
  'Obtížnost lze přizpůsobit; při zdravotním omezení se před lekcí poraďte s lektorkou.'
)
ON CONFLICT (id) DO NOTHING;

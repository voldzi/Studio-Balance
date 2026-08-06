ALTER TABLE class_types
  ADD COLUMN difficulty smallint NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  ADD COLUMN benefits text NOT NULL DEFAULT '',
  ADD COLUMN audience text NOT NULL DEFAULT '',
  ADD COLUMN suitable_for_beginners boolean NOT NULL DEFAULT true,
  ADD COLUMN default_equipment text NOT NULL DEFAULT '',
  ADD COLUMN what_to_bring text NOT NULL DEFAULT '',
  ADD COLUMN practical_notice text NOT NULL DEFAULT '',
  ADD COLUMN hero_image_path text NOT NULL DEFAULT '',
  ADD COLUMN hero_image_alt text NOT NULL DEFAULT '',
  ADD COLUMN seo_title text NOT NULL DEFAULT '',
  ADD COLUMN seo_description text NOT NULL DEFAULT '';

ALTER TABLE account_notifications
  DROP CONSTRAINT account_notifications_kind_check;

ALTER TABLE account_notifications
  ADD CONSTRAINT account_notifications_kind_check CHECK (
    kind IN ('booking_confirmed', 'booking_cancelled', 'session_changed', 'session_cancelled', 'lesson_reminder')
  );

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  kind text NOT NULL CHECK (kind IN ('booking_confirmation', 'lesson_reminder', 'booking_cancelled', 'session_changed', 'session_cancelled')),
  channel text NOT NULL CHECK (channel IN ('email')),
  scheduled_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled')),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_outbox_one_kind_per_booking_schedule_idx
  ON notification_outbox (booking_id, kind, scheduled_at);
CREATE INDEX notification_outbox_due_idx
  ON notification_outbox (status, scheduled_at)
  WHERE status = 'pending';

UPDATE class_types
SET
  difficulty = data.difficulty,
  benefits = data.benefits,
  audience = data.audience,
  suitable_for_beginners = data.suitable_for_beginners,
  default_equipment = data.default_equipment,
  what_to_bring = data.what_to_bring,
  practical_notice = data.practical_notice,
  hero_image_path = data.hero_image_path,
  hero_image_alt = data.hero_image_alt,
  seo_title = data.seo_title,
  seo_description = data.seo_description
FROM (
  VALUES
    ('barre', 3::smallint, 'Formuje držení těla, posiluje hluboké svaly a podporuje stabilitu.', 'Pro ty, kdo hledají elegantní a soustředěný pohyb s důrazem na techniku.', true, 'Barre tyč, lehké činky nebo overball podle náplně lekce.', 'Pohodlné oblečení, vodu a případně protiskluzové ponožky.', 'Cvičte v rozsahu, který je vám příjemný; při zdravotních omezeních se poraďte s lektorkou.', '/images/studio-balance/lessons/barre.jpeg', 'Ukázkový vizuál lekce Barre ve Studio Balance.', 'Barre | Studio Balance', 'Barre ve Studio Balance: stabilita, držení těla a vědomý pohyb.'),
    ('trx', 4::smallint, 'Posiluje celé tělo, podporuje stabilitu a práci s vlastní vahou.', 'Pro zájemce o funkční silový trénink s možností přizpůsobit obtížnost.', true, 'TRX závěsný systém a podložka podle náplně lekce.', 'Pohodlné sportovní oblečení, pevnou obuv, vodu a ručník.', 'Nastavení obtížnosti vždy přizpůsobte svému pohybu a instrukcím lektorky.', '/images/studio-balance/lessons/trx.jpeg', 'Ukázkový vizuál lekce TRX ve Studio Balance.', 'TRX | Studio Balance', 'TRX ve Studio Balance: funkční síla, stabilita a kontrola pohybu.'),
    ('balance-flow', 2::smallint, 'Rozvíjí rovnováhu, koordinaci, mobilitu a vědomý pohyb.', 'Pro každého, kdo chce v klidnějším tempu posílit stabilitu a jistotu v pohybu.', true, 'Balance Flow Board, podložka a drobné pomůcky podle náplně lekce.', 'Pohodlné oblečení, vodu a čisté ponožky nebo cvičení naboso podle pokynů lektorky.', 'Lekce vychází z vlastního tempa; lektorce vždy řekněte o omezení pohybu.', '/images/studio-balance/lessons/balance-flow.jpeg', 'Ukázkový vizuál lekce Balance Flow Board ve Studio Balance.', 'Balance Flow | Studio Balance', 'Balance Flow ve Studio Balance: rovnováha, mobilita a plynulý pohyb.'),
    ('jumping', 5::smallint, 'Podporuje kondici, koordinaci a energický pohyb na trampolíně.', 'Pro klientky, které mají chuť na intenzivní dynamickou lekci.', false, 'Malá trampolína a madlo podle vybavení studia.', 'Pohodlné sportovní oblečení, pevnou obuv, vodu a ručník.', 'Před první lekcí dejte lektorce vědět o zdravotních omezeních nebo těhotenství.', '/images/studio-balance/lessons/jumping.jpeg', 'Ukázkový vizuál dynamické lekce Jumping ve Studio Balance.', 'Jumping | Studio Balance', 'Jumping ve Studio Balance: dynamická lekce na trampolínách.'),
    ('power-joga', 3::smallint, 'Rozvíjí sílu, flexibilitu, mobilitu, dech a soustředění.', 'Pro ty, kdo chtějí propojit plynulou jógovou praxi se silou a klidem.', true, 'Podložka a jógové bloky podle náplně lekce.', 'Pohodlné oblečení, vodu a případně vlastní podložku.', 'Volte variantu pozice, která odpovídá vašim možnostem; omezení konzultujte s lektorkou.', '/images/studio-balance/lessons/power-joga.jpeg', 'Ukázkový vizuál lekce Power jóga ve Studio Balance.', 'Power jóga | Studio Balance', 'Power jóga ve Studio Balance: síla, dech a plynulý pohyb.'),
    ('kruhovy-trenink', 4::smallint, 'Posiluje celé tělo, rozvíjí kondici a přináší pestrý funkční pohyb.', 'Pro zájemce o komplexní trénink v menší skupině s možností upravit tempo.', true, 'Činky, medicinbal, podložka, TRX a další pomůcky podle stanovišť.', 'Pohodlné sportovní oblečení, pevnou obuv, vodu a ručník.', 'Tempo i zátěž přizpůsobte svému aktuálnímu stavu a pokynům lektorky.', '/images/studio-balance/lessons/kruhovy-trenink.jpeg', 'Ukázkový vizuál kruhového tréninku ve Studio Balance.', 'Kruhový trénink | Studio Balance', 'Kruhový trénink ve Studio Balance: síla, kondice a funkční pohyb.')
) AS data(slug, difficulty, benefits, audience, suitable_for_beginners, default_equipment, what_to_bring, practical_notice, hero_image_path, hero_image_alt, seo_title, seo_description)
WHERE class_types.slug = data.slug;

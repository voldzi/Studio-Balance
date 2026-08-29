INSERT INTO reviews (
  id, author_label, body, reviewed_on, rating, class_type_id,
  consent_confirmed, published, featured, sort_order
)
VALUES
  (
    '40000000-0000-4000-8000-000000000002',
    'Helena Šimková',
    'Já miluji TRX… Práce s vlastním tělem, s vlastní váhou… Ruce – všechny svaly se zapojí, biceps, triceps… a pak i břicho, nohy… Vše je skvělé.',
    '2026-08-02',
    NULL,
    '20000000-0000-4000-8000-000000000002',
    true,
    true,
    true,
    20
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'Eva Gaidadzi',
    'Jumping s Nicou je pro mě relax, zábava a jedna z cest, jak se udržet v kondici. ✨',
    '2026-08-03',
    NULL,
    '20000000-0000-4000-8000-000000000004',
    true,
    true,
    true,
    30
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'Monika Jendrišáková',
    'Jumping je nejlepší relax, který znám. ❤️',
    '2026-08-04',
    NULL,
    '20000000-0000-4000-8000-000000000004',
    true,
    true,
    true,
    40
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    'Veronika Škobrtalová',
    'Jumping je vždycky nejlepší odreagování po práci. Vypnu a cítím se dobře. Nica je nejlepší. ❤️ Je to relax a dobití energie.',
    '2026-08-05',
    NULL,
    '20000000-0000-4000-8000-000000000004',
    true,
    true,
    true,
    50
  ),
  (
    '40000000-0000-4000-8000-000000000006',
    'Lenka Zvyhalová',
    'My jsme s Karolinkou na jumpingu moc spokojené. Naprosto vypnu hlavu a je mi skvěle. ❤️',
    '2026-08-06',
    NULL,
    '20000000-0000-4000-8000-000000000004',
    true,
    true,
    false,
    70
  ),
  (
    '40000000-0000-4000-8000-000000000007',
    'Hana Dokládalová',
    'TRX cvičení je úplná pecka. Měla jsem neskutečné bolesti zad a tohle mi je krásně odbouralo. 🩷💪🏼',
    '2026-08-07',
    NULL,
    '20000000-0000-4000-8000-000000000002',
    true,
    true,
    true,
    60
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

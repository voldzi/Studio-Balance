-- CD-066: cosmetic rename of the existing lesson; keep its ID and public slug.
UPDATE class_types
SET name='Formuj břicho a hýždě',
    seo_title='Formuj břicho a hýždě | Studio Balance',
    seo_description='Formuj břicho a hýždě ve Studiu Balance – posilování středu těla a hýždí s Nicolou Lojškovou.',
    hero_image_path=CASE WHEN hero_image_path='/images/studio-balance/lessons/body-sculpt.jpeg'
      THEN '/images/studio-balance/lessons/formuj-bricho-a-hyzde.png' ELSE hero_image_path END,
    hero_image_alt=CASE WHEN hero_image_path='/images/studio-balance/lessons/body-sculpt.jpeg'
      THEN 'Plakát lekce Formuj břicho a hýždě' ELSE hero_image_alt END,updated_at=now()
WHERE slug='body-sculpt';

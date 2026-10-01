-- CD-061: studio-approved Body Sculpt catalogue and corrected poster.
INSERT INTO class_types (slug,name,tagline,description,duration_minutes,arrival_lead_minutes,active,sort_order,difficulty,
  benefits,audience,suitable_for_beginners,default_equipment,what_to_bring,practical_notice,hero_image_path,hero_image_alt,seo_title,seo_description)
VALUES ('body-sculpt','Body Sculpt','Formuj. Posiluj. Cítíš se silnější.',
  'Posilovací lekce zaměřená na střed těla, hýždě a celé tělo. Cvičíme s pomůckami i vlastní vahou.',60,10,true,70,2,
  'Zpevnění středu těla, posílení a tvarování hýždí, posílení celého těla.','Lekci lze přizpůsobit začátečnicím i pokročilým.',true,
  'Pomůcky jsou připravené ve studiu.','Sportovní oblečení, pohodlnou obuv a pití.','',
  '/images/studio-balance/lessons/body-sculpt.jpeg','Schválený plakát lekce Body Sculpt','Body Sculpt | Studio Balance',
  'Body Sculpt ve Studiu Balance – posilování celého těla s Nicolou Lojškovou.')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO class_type_instructors (class_type_id,instructor_id,schedule_note)
SELECT id,'10000000-0000-4000-8000-000000000001'::uuid,'Čtvrtek 17:00' FROM class_types WHERE slug='body-sculpt'
ON CONFLICT (class_type_id,instructor_id) DO NOTHING;

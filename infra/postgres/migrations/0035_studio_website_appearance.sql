ALTER TABLE studio_website_photo_settings
  ADD COLUMN photos_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN palette text NOT NULL DEFAULT 'original' CHECK (palette IN ('original', 'sage', 'rose', 'clay')),
  ADD COLUMN section_order text[] NOT NULL DEFAULT ARRAY['studio','lessons','flow','transformations','reviews','massage']
    CHECK (cardinality(section_order) = 6 AND section_order @> ARRAY['studio','lessons','flow','transformations','reviews','massage']),
  ADD COLUMN logo_asset_id uuid REFERENCES media_assets(id),
  ADD COLUMN story_asset_id uuid REFERENCES media_assets(id),
  ADD COLUMN flow_asset_id uuid REFERENCES media_assets(id);

UPDATE studio_website_photo_settings SET photos_configured = true WHERE revision > 0;

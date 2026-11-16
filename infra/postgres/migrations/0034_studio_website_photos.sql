CREATE TABLE studio_website_photo_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  home_asset_id uuid REFERENCES media_assets(id),
  about_asset_id uuid REFERENCES media_assets(id)
);
INSERT INTO studio_website_photo_settings DEFAULT VALUES;

CREATE TABLE studio_website_photos (
  asset_id uuid PRIMARY KEY REFERENCES media_assets(id),
  alt text NOT NULL CHECK (char_length(btrim(alt)) BETWEEN 2 AND 300),
  visible boolean NOT NULL,
  position integer NOT NULL UNIQUE CHECK (position BETWEEN 0 AND 39)
);

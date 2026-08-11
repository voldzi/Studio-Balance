CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key text NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 1 AND 500),
  content_type text NOT NULL CHECK (content_type IN ('image/webp')),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 4000),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 4000),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_transformations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  story text NOT NULL CHECK (char_length(story) BETWEEN 10 AND 2000),
  attribution text NOT NULL CHECK (char_length(attribution) BETWEEN 1 AND 120),
  class_type_id uuid REFERENCES class_types(id) ON DELETE SET NULL,
  before_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  after_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  consent_confirmed boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transformations_distinct_images CHECK (before_asset_id <> after_asset_id),
  CONSTRAINT transformations_publication_requires_consent CHECK (NOT published OR consent_confirmed),
  CONSTRAINT transformations_feature_requires_publication CHECK (NOT featured OR published)
);

CREATE INDEX client_transformations_public_order_idx
  ON client_transformations (featured DESC, sort_order, created_at DESC)
  WHERE published = true AND consent_confirmed = true;

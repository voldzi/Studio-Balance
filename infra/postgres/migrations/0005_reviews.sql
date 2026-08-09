CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_label text NOT NULL CHECK (char_length(author_label) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  source text CHECK (source IS NULL OR char_length(source) BETWEEN 2 AND 200),
  reviewed_on date,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  class_type_id uuid REFERENCES class_types(id) ON DELETE SET NULL,
  consent_confirmed boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_publication_requires_consent CHECK (NOT published OR consent_confirmed)
);

CREATE INDEX reviews_public_order_idx
  ON reviews (featured DESC, sort_order, reviewed_on DESC, created_at DESC)
  WHERE published = true;

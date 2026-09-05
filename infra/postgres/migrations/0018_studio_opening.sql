CREATE TABLE studio_operation (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  requested_open boolean NOT NULL DEFAULT false,
  registration_synced boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO studio_operation (id) VALUES (true);

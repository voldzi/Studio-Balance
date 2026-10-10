-- Anonymous contributions are kept separately until an MFA administrator decides.
CREATE TABLE review_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  author_label text NOT NULL CHECK (char_length(author_label) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  consent_version text NOT NULL CHECK (char_length(consent_version) BETWEEN 1 AND 100),
  consented_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderation_payload_hash text CHECK (moderation_payload_hash IS NULL OR moderation_payload_hash ~ '^[0-9a-f]{64}$'),
  moderated_at timestamptz,
  moderated_by text,
  moderation_reason text CHECK (moderation_reason IS NULL OR char_length(moderation_reason) BETWEEN 3 AND 500),
  review_id uuid UNIQUE REFERENCES reviews(id) ON DELETE RESTRICT,
  CONSTRAINT review_submission_decision CHECK (
    (status='pending' AND moderation_payload_hash IS NULL AND moderated_at IS NULL AND moderated_by IS NULL AND moderation_reason IS NULL AND review_id IS NULL)
    OR (status='approved' AND moderation_payload_hash IS NOT NULL AND moderated_at IS NOT NULL AND moderated_by IS NOT NULL AND review_id IS NOT NULL)
    OR (status='rejected' AND moderation_payload_hash IS NOT NULL AND moderated_at IS NOT NULL AND moderated_by IS NOT NULL AND moderation_reason IS NOT NULL AND review_id IS NULL)
  )
);
CREATE INDEX review_submissions_status_date_idx ON review_submissions(status,created_at,id);

-- Short-lived anti-abuse data contains a purpose-separated keyed network prefix
-- hash only, never the source IP, browser identifier or review text.
CREATE TABLE review_submission_rate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_hash text NOT NULL CHECK (network_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours'
);
CREATE INDEX review_submission_rate_created_idx ON review_submission_rate_events(created_at,network_hash);
CREATE INDEX review_submission_rate_expires_idx ON review_submission_rate_events(expires_at);

CREATE FUNCTION protect_review_submission_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.nonce,NEW.payload_hash,NEW.author_label,NEW.body,NEW.rating,NEW.consent_version,NEW.consented_at,NEW.created_at)
    IS DISTINCT FROM (OLD.nonce,OLD.payload_hash,OLD.author_label,OLD.body,OLD.rating,OLD.consent_version,OLD.consented_at,OLD.created_at) THEN
    RAISE EXCEPTION 'Review submission original is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status <> 'pending' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Review submission decision is final' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_submission_original_guard BEFORE UPDATE ON review_submissions
  FOR EACH ROW EXECUTE FUNCTION protect_review_submission_original();

CREATE FUNCTION protect_submitted_review_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.author_label,NEW.body,NEW.rating) IS DISTINCT FROM (OLD.author_label,OLD.body,OLD.rating)
    AND EXISTS (SELECT 1 FROM review_submissions WHERE review_id=OLD.id) THEN
    RAISE EXCEPTION 'Submitted review author, text and rating are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER submitted_review_content_guard BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION protect_submitted_review_content();

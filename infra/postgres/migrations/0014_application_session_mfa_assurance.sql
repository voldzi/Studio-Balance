-- Persist proof that the original interactive OIDC authentication included
-- the OTP factor. Role refreshes may never upgrade this assurance.
ALTER TABLE application_sessions
  ADD COLUMN mfa_verified boolean NOT NULL DEFAULT false;

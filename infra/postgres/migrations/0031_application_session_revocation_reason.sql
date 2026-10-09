-- Additive diagnostics only: legacy revocations keep an unknown (NULL) reason.
-- Never backfill an assumed cause or retain cookies, token hashes or provider text
-- in diagnostic metadata. Session UUIDs are independent of browser credentials.
ALTER TABLE application_sessions
  ADD COLUMN revoke_reason text,
  ADD COLUMN revoke_detail text,
  ADD COLUMN revoke_request_id varchar(100),
  ADD CONSTRAINT application_sessions_revoke_reason CHECK (
    revoke_reason IS NULL OR revoke_reason IN (
      'explicit_logout', 'absolute_expired', 'idle_expired',
      'refresh_credential_missing', 'refresh_credential_unreadable',
      'provider_invalid_grant', 'identity_token_invalid',
      'subject_changed', 'admin_role_removed'
    )
  ),
  ADD CONSTRAINT application_sessions_revoke_detail CHECK (
    revoke_detail IS NULL OR (revoke_reason = 'identity_token_invalid' AND revoke_detail IN (
      'identity_token_missing', 'identity_claims_incomplete', 'issuer_invalid',
      'audience_invalid', 'token_expired', 'signature_invalid', 'token_malformed',
      'algorithm_invalid', 'claims_invalid'
    ))
  ),
  ADD CONSTRAINT application_sessions_revoke_metadata CHECK (
    (revoke_reason IS NULL AND revoke_detail IS NULL AND revoke_request_id IS NULL)
    OR (revoke_reason IS NOT NULL AND revoked_at IS NOT NULL AND revoke_request_id IS NOT NULL)
  ),
  ADD CONSTRAINT application_sessions_revoke_request_id CHECK (
    revoke_request_id IS NULL OR revoke_request_id ~ '^[A-Za-z0-9_-]{1,100}$'
  );

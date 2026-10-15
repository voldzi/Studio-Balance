# Studio Balance Keycloak theme

Brand theme verified against Keycloak 26.8.0 login, registration, password reset,
email-verification and authenticator-app screens. It inherits `keycloak.v2`
and intentionally changes only presentation and localized messages. Keycloak
continues to own credentials, MFA, reset, verification, brute-force protection
and the OIDC flow.

Authentication templates stay inherited. The only template extension is the
upstream `footer.ftl` hook for localized sign-in help; it contains no credential
form or JavaScript. Its recovery link is shown only when the realm permits
password reset. Recovery itself requires verified SMTP and the password-only
flow that preserves enrolled OTP (CD-073 / ADR 0031).

Validate locally with:

```bash
bash scripts/validate-keycloak-theme.sh
docker compose up -d postgres keycloak
```

Production publication follows [the CD-073 operations procedure](../../../../docs/operations.md#obnova-hesla-a-ochrana-přihlášení-cd-073--adr-0031):

- Validate the theme from a clean, tested Git revision.
- Publish a complete copy into a new revision-specific directory in the existing
  `/opt/keycloak/themes` mount, for example `studio-balance-recovery-<git-sha>`.
  Keep existing theme directories intact and verify the installed files.
- Save the prior realm theme name in the protected rollback record on the
  UUID-verified X5 storage, following the operations procedure. Never create an
  internal-disk fallback when that storage is unavailable.
- Use the existing scoped operations service credentials through the documented
  protected input path. Update only `loginTheme` of the `studio-balance` realm;
  keep credentials out of command arguments, chat, logs and local `.env` files.
- Verify the public login, localized help and conditional recovery link, and
  confirm that administrator MFA stays required. Enabling recovery separately
  requires verified message delivery and a complete test-account reset.

Rollback restores the recorded prior `loginTheme` value for this realm. Retain
the prior directory so rollback does not require a new build. Versioned theme
publication does not restart shared Keycloak or reconfigure other realms.

The retired `scripts/deploy-production-keycloak-theme.sh` and
`infra/keycloak/install-studio-balance-theme.sh` commands exit with status 64
before reading credentials or changing files. They must not be used to replace
an active theme in place.


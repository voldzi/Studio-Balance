# Studio Balance Keycloak theme

Brand theme for the Keycloak 26.1 login, registration, password reset,
email-verification and authenticator-app screens. It inherits `keycloak.v2`
and intentionally changes only presentation and localized messages. Keycloak
continues to own credentials, MFA, reset, verification, brute-force protection
and the OIDC flow.

The production deployment script installs the directory into the existing
read-only theme mount and activates `loginTheme=studio-balance` only for the
`studio-balance` realm. The shared Keycloak container and other realms are not
reconfigured.

Validate locally with:

```bash
bash scripts/validate-keycloak-theme.sh
docker compose up -d postgres keycloak
```

Deploy interactively from the trusted administrator workstation with:

```bash
bash scripts/deploy-production-keycloak-theme.sh
```

The deployment prompts for the Keycloak master administrator password without
echoing or storing it. It backs up an existing theme directory, validates the
installed files, restarts Keycloak, waits for readiness, updates only the
target realm and verifies the public login page.


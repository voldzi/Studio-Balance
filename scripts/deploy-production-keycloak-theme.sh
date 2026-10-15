#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'MESSAGE'
Legacy in-place Keycloak theme deployment is disabled (CD-073 / ADR 0031).
Follow docs/operations.md, "Obnova hesla a ochrana přihlášení": publish a new
versioned theme directory, then update only the Studio Balance realm using
the existing scoped service credentials. Preserve the prior theme for rollback.
Do not replace the active theme directory or restart shared Keycloak.
This retired command reads no credentials and performs no local or remote changes.
MESSAGE
exit 64

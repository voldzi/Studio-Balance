#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'MESSAGE'
Legacy in-place Keycloak theme installation is disabled (CD-073 / ADR 0031).
Follow docs/operations.md, "Obnova hesla a ochrana přihlášení": install a new
versioned theme directory in the existing theme mount and activate it only for
the Studio Balance realm with the existing scoped service credentials.
Preserve the active theme and uploaded archive; this command changes neither.
This retired command reads no credentials and performs no local or remote changes.
MESSAGE
exit 64

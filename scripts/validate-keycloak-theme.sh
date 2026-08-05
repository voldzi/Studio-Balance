#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
theme="$root/infra/keycloak/themes/studio-balance/login"
failures=0

require_file() {
  if [[ ! -s "$theme/$1" ]]; then
    echo "FAIL: missing or empty theme file: $1" >&2
    failures=$((failures + 1))
  fi
}

require_file theme.properties
require_file messages/messages_cs.properties
require_file messages/messages_en.properties
require_file resources/css/studio-balance-login.css
require_file resources/img/brand-logo.jpg
require_file resources/img/studio-hero.jpg

grep -q '^parent=keycloak.v2$' "$theme/theme.properties" || failures=$((failures + 1))
grep -q '^locales=cs,en$' "$theme/theme.properties" || failures=$((failures + 1))
grep -q 'prefers-reduced-motion' "$theme/resources/css/studio-balance-login.css" || failures=$((failures + 1))
grep -q '@media (max-width: 420px)' "$theme/resources/css/studio-balance-login.css" || failures=$((failures + 1))
grep -q '^loginTotpTitle=' "$theme/messages/messages_cs.properties" || failures=$((failures + 1))

cmp -s "$theme/resources/img/brand-logo.jpg" "$root/apps/web/public/images/studio-balance/brand-logo.jpg" || {
  echo "FAIL: Keycloak logo differs from the approved web logo." >&2
  failures=$((failures + 1))
}
cmp -s "$theme/resources/img/studio-hero.jpg" "$root/apps/web/public/images/studio-balance/studio-hero.jpg" || {
  echo "FAIL: Keycloak hero differs from the approved preview photograph." >&2
  failures=$((failures + 1))
}
if find "$theme" -type f \( -name '*.ftl' -o -name '*.js' \) -print -quit | grep -q .; then
  echo "FAIL: Theme must not override Keycloak templates or add JavaScript." >&2
  failures=$((failures + 1))
fi
if grep -Eq "url\\([\"']?https?://" "$theme/resources/css/studio-balance-login.css"; then
  echo "FAIL: Theme must not load external resources." >&2
  failures=$((failures + 1))
fi

if [[ "$failures" -ne 0 ]]; then
  echo "Keycloak theme validation failed: $failures problem(s)." >&2
  exit 1
fi

echo "Keycloak theme validation passed."

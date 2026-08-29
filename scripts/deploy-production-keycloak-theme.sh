#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
theme_root="$root/infra/keycloak/themes"
installer="$root/infra/keycloak/install-studio-balance-theme.sh"
realm="studio-balance"
public_issuer="https://login.studio-balance.cz"
admin_issuer="$public_issuer"
remote_archive="/tmp/studio-balance-keycloak-theme.$$.tar.gz"
remote_installer="/tmp/install-studio-balance-keycloak-theme.$$.sh"
archive="$(mktemp /tmp/studio-balance-keycloak-theme.XXXXXX.tar.gz)"

cleanup() {
  rm -f "$archive"
  unset admin_password
  ssh docker.home.cz "rm -f '$remote_archive' '$remote_installer'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

command -v ssh >/dev/null
command -v scp >/dev/null
command -v tar >/dev/null
command -v curl >/dev/null

bash "$root/scripts/validate-keycloak-theme.sh"

echo "This deploys a theme to the shared production Keycloak and restarts its container."
read -r -p "Type APPLY to continue: " confirmation
[[ "$confirmation" == "APPLY" ]] || { echo "Deployment cancelled."; exit 1; }

read -r -p "Keycloak master admin user [admin]: " admin_user
admin_user="${admin_user:-admin}"
read -rs -p "Password for Keycloak master admin: " admin_password
printf '\n'

tar -C "$theme_root" -czf "$archive" studio-balance
scp "$archive" "docker.home.cz:$remote_archive"
scp "$installer" "docker.home.cz:$remote_installer"
ssh docker.home.cz "bash '$remote_installer' '$remote_archive'"

ssh docker.home.cz 'docker restart keycloak >/dev/null'
for _ in $(seq 1 30); do
  status="$(ssh docker.home.cz 'docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" keycloak')"
  [[ "$status" == "healthy" ]] && break
  sleep 4
done
[[ "${status:-}" == "healthy" ]] || { echo "Keycloak did not become healthy after theme installation." >&2; exit 1; }

printf '%s\n' "$admin_password" | ssh docker.home.cz \
  "docker exec -i keycloak sh -c 'IFS= read -r KC_CLI_PASSWORD; export KC_CLI_PASSWORD; \
  config=/tmp/studio-balance-theme-kcadm.config; \
  /opt/keycloak/bin/kcadm.sh config credentials --config \"\$config\" --server \"$admin_issuer\" --realm master --user \"$admin_user\" >/dev/null; \
  /opt/keycloak/bin/kcadm.sh update --config \"\$config\" realms/$realm \
    -s loginTheme=studio-balance \
    -s internationalizationEnabled=true \
    -s defaultLocale=cs \
    -s '\''supportedLocales=[\"cs\",\"en\"]'\'' >/dev/null; \
  /opt/keycloak/bin/kcadm.sh get --config \"\$config\" realms/$realm --fields realm,loginTheme,internationalizationEnabled,defaultLocale,supportedLocales; \
  rm -f \"\$config\"'"

challenge="DudjUTF-D--ykHJv5sFO7istODKk8U-MlRd74GKh7Oo"
auth_url="$public_issuer/realms/$realm/protocol/openid-connect/auth?client_id=studiobalance-web&redirect_uri=https%3A%2F%2Fstudio-balance.cz%2Fauth%2Fcallback&response_type=code&scope=openid&state=theme-smoke&nonce=theme-smoke&code_challenge=$challenge&code_challenge_method=S256"
page="$(curl --fail --silent --show-error "$auth_url")"
grep -q 'studio-balance-login.css' <<<"$page" || { echo "Public login did not load the Studio Balance theme." >&2; exit 1; }

echo "Studio Balance Keycloak theme is active and the public login loads its stylesheet."

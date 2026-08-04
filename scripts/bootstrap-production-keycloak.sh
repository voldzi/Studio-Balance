#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="$root/infra/keycloak/realm/studio-balance-realm.json"
issuer_host="login.zeleznalady.cz"
realm="studio-balance"

command -v ssh >/dev/null && command -v scp >/dev/null && command -v openssl >/dev/null && command -v node >/dev/null || { echo "ssh, scp, openssl and node are required." >&2; exit 1; }
read -r -p "Keycloak master admin user [admin]: " admin_user
admin_user="${admin_user:-admin}"
read -rs -p "Password for Keycloak master admin: " admin_password
printf '\n'

web_secret="$(openssl rand -hex 32)"
admin_secret="$(openssl rand -hex 32)"
realm_file="$(mktemp /tmp/studiobalance-realm.XXXXXX.json)"
remote_file="/tmp/studiobalance-realm.$$.json"
trap 'rm -f "$realm_file"; unset admin_password web_secret admin_secret' EXIT

WEB_SECRET="$web_secret" ADMIN_SECRET="$admin_secret" node - "$template" "$realm_file" <<'NODE'
const [source, destination] = process.argv.slice(2);
const realm = JSON.parse(require('fs').readFileSync(source, 'utf8'));
for (const client of realm.clients) {
  client.secret = client.clientId === 'studiobalance-web' ? process.env.WEB_SECRET : process.env.ADMIN_SECRET;
  client.redirectUris = client.clientId === 'studiobalance-web' ? ['https://studiobalance.zeleznalady.cz/*'] : ['https://studiobalance.zeleznalady.cz/admin/*'];
  client.webOrigins = ['https://studiobalance.zeleznalady.cz'];
}
require('fs').writeFileSync(destination, JSON.stringify(realm));
NODE

scp "$realm_file" "docker.home.cz:$remote_file"
printf '%s\n' "$admin_password" | ssh docker.home.cz "docker exec -i keycloak /opt/keycloak/bin/kcadm.sh config credentials --config /tmp/studiobalance-kcadm.config --server https://$issuer_host --realm master --user '$admin_user'"
if ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh get --config /tmp/studiobalance-kcadm.config realms/$realm >/dev/null 2>&1"; then
  echo "Realm $realm already exists; refusing to overwrite it."
else
  ssh docker.home.cz "docker cp '$remote_file' keycloak:/tmp/studiobalance-realm.json && docker exec keycloak /opt/keycloak/bin/kcadm.sh create --config /tmp/studiobalance-kcadm.config realms -f /tmp/studiobalance-realm.json && docker exec keycloak rm -f /tmp/studiobalance-realm.json"
  echo "Realm $realm created. Store these once in the production secret store:"
  printf 'OIDC_WEB_CLIENT_SECRET=%s\nOIDC_ADMIN_CLIENT_SECRET=%s\n' "$web_secret" "$admin_secret"
fi
ssh docker.home.cz "rm -f '$remote_file'; docker exec keycloak rm -f /tmp/studiobalance-kcadm.config" || true

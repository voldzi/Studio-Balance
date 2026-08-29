#!/usr/bin/env bash
# shellcheck disable=SC2016,SC2029
set -euo pipefail

realm="studio-balance"
public_issuer="https://login.studio-balance.cz"
admin_issuer="$public_issuer"
public_app="https://studio-balance.cz"
config_path="/tmp/studiobalance-domain-kcadm.$$.config"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/configure-production-domain.sh

Sets the Studio Balance realm frontend URL to login.studio-balance.cz and
accepts callbacks only from studio-balance.cz.

The script never stores or prints the Keycloak master password.
USAGE
}

while (($#)); do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
for command in ssh node; do command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }; done
read -r -p "Keycloak master admin user [admin]: " admin_user
admin_user="${admin_user:-admin}"
[[ "$admin_user" =~ ^[A-Za-z0-9._@-]{1,128}$ ]] || { echo "Unsupported administrator username." >&2; exit 2; }
if [[ -z "${KEYCLOAK_MASTER_PASSWORD:-}" ]]; then
  read -rs -p "Password for Keycloak master admin: " admin_password
  printf '\n'
else
  admin_password="$KEYCLOAK_MASTER_PASSWORD"
fi

cleanup() {
  ssh docker.home.cz "docker exec keycloak rm -f '$config_path'" >/dev/null 2>&1 || true
  unset admin_password KEYCLOAK_MASTER_PASSWORD
}
trap cleanup EXIT

printf '%s\n' "$admin_password" | ssh docker.home.cz \
  "docker exec -i keycloak sh -c 'IFS= read -r KC_CLI_PASSWORD; export KC_CLI_PASSWORD; exec /opt/keycloak/bin/kcadm.sh config credentials --config $config_path --server $admin_issuer --realm master --user '\''$admin_user'\'''"

remote() {
  local quoted=""
  printf -v quoted ' %q' "$@"
  ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh${quoted} --config '$config_path' -r '$realm'"
}

client_id_for() {
  local clients
  clients="$(remote get "clients?clientId=$1")"
  node -e 'const clients=JSON.parse(process.argv[1]); if(clients.length!==1) process.exit(1); process.stdout.write(clients[0].id)' "$clients"
}

web_id="$(client_id_for studiobalance-web)"
admin_id="$(client_id_for studiobalance-admin)"
web_redirects='["https://studio-balance.cz/*"]'
admin_redirects='["https://studio-balance.cz/admin/*"]'
origins='["https://studio-balance.cz"]'

remote update "realms/$realm" -s "attributes.frontendUrl=$public_issuer"
remote update "clients/$web_id" \
  -s "rootUrl=$public_app" -s 'baseUrl=/' -s "adminUrl=$public_app" \
  -s "redirectUris=$web_redirects" -s "webOrigins=$origins" \
  -s 'attributes."post.logout.redirect.uris"=https://studio-balance.cz/*'
remote update "clients/$admin_id" \
  -s "rootUrl=$public_app" -s 'baseUrl=/admin' -s "adminUrl=$public_app/admin" \
  -s "redirectUris=$admin_redirects" -s "webOrigins=$origins" \
  -s 'attributes."post.logout.redirect.uris"=https://studio-balance.cz/*'

realm_state="$(remote get "realms/$realm")"
web_state="$(remote get "clients/$web_id")"
admin_state="$(remote get "clients/$admin_id")"
node - "$public_issuer" "$public_app" "$realm_state" "$web_state" "$admin_state" <<'NODE'
const [issuer, app, realmRaw, webRaw, adminRaw] = process.argv.slice(2);
const realm = JSON.parse(realmRaw);
const web = JSON.parse(webRaw);
const admin = JSON.parse(adminRaw);
if (realm.attributes?.frontendUrl !== issuer) throw new Error("Realm frontend URL was not updated.");
for (const client of [web, admin]) {
  if (client.rootUrl !== app) throw new Error(`Unexpected root URL on ${client.clientId}.`);
  if (!client.webOrigins?.includes(app)) throw new Error(`New origin missing on ${client.clientId}.`);
}
if (!web.redirectUris?.includes(`${app}/*`) || !admin.redirectUris?.includes(`${app}/admin/*`)) {
  throw new Error("New callback URL is missing.");
}
const unexpectedOrigin = [...web.redirectUris, ...admin.redirectUris, ...web.webOrigins, ...admin.webOrigins]
  .find((value) => !value.startsWith(app));
if (unexpectedOrigin) throw new Error(`Unexpected callback/origin remains: ${unexpectedOrigin}`);
NODE

echo "Studio Balance Keycloak domain is configured."
echo "Public issuer: $public_issuer/realms/$realm"
echo "Application:   $public_app"

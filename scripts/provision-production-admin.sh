#!/usr/bin/env bash
set -euo pipefail

realm="studio-balance"
issuer="https://login.zeleznalady.cz"
username="${STUDIO_BALANCE_ADMIN_USERNAME:-preview-admin@studiobalance.invalid}"
config_path="/tmp/studiobalance-admin-kcadm.config"

command -v ssh >/dev/null && command -v openssl >/dev/null || { echo "ssh and openssl are required." >&2; exit 1; }
read -r -p "Keycloak master admin user [admin]: " admin_user
admin_user="${admin_user:-admin}"
if [[ -z "${KEYCLOAK_MASTER_PASSWORD:-}" ]]; then
  read -rs -p "Password for Keycloak master admin: " admin_password
  printf '\n'
else
  admin_password="$KEYCLOAK_MASTER_PASSWORD"
fi

cleanup() {
  ssh docker.home.cz "docker exec keycloak rm -f '$config_path'" >/dev/null 2>&1 || true
  unset admin_password KEYCLOAK_MASTER_PASSWORD password
}
trap cleanup EXIT

printf '%s\n' "$admin_password" | ssh docker.home.cz \
  "docker exec -i keycloak sh -c 'IFS= read -r KC_CLI_PASSWORD; export KC_CLI_PASSWORD; exec /opt/keycloak/bin/kcadm.sh config credentials --config $config_path --server $issuer --realm master --user '\''$admin_user'\'''"

if ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh get --config '$config_path' 'users?username=$username&exact=true' -r '$realm'" | grep -q '"id"'; then
  echo "Admin account $username already exists; refusing to replace its password." >&2
  exit 1
fi

password="$(openssl rand -base64 30 | tr -d '=+/' | cut -c1-22)Aa1!"
ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh create --config '$config_path' users -r '$realm' -s 'username=$username' -s 'email=$username' -s 'enabled=true' -s 'emailVerified=true' -s 'firstName=Správa' -s 'lastName=Studia' -s 'requiredActions=[\"CONFIGURE_TOTP\"]' && docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles --config '$config_path' -r '$realm' --uusername '$username' --rolename admin && docker exec keycloak /opt/keycloak/bin/kcadm.sh set-password --config '$config_path' -r '$realm' --username '$username' --new-password '$password'"

printf 'USERNAME=%s\nPASSWORD=%s\n' "$username" "$password"
echo "The account must configure TOTP MFA during its first admin login. Store the password in the approved secret channel."

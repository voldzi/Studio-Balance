#!/usr/bin/env bash
set -euo pipefail

realm="studio-balance"
issuer="https://login.zeleznalady.cz"
accounts=(
  "preview-zadavatel@studiobalance.invalid|Zadavatel|Preview"
  "preview-kontrola@studiobalance.invalid|Kontrola|Preview"
)

command -v ssh >/dev/null && command -v openssl >/dev/null || {
  echo "ssh and openssl are required." >&2
  exit 1
}

read -r -p "Keycloak master admin user [admin]: " admin_user
admin_user="${admin_user:-admin}"
if [[ -z "${KEYCLOAK_MASTER_PASSWORD:-}" ]]; then
  read -rs -p "Password for Keycloak master admin: " admin_password
  printf '\n'
else
  admin_password="$KEYCLOAK_MASTER_PASSWORD"
fi

for item in "${accounts[@]}"; do
  IFS='|' read -r username first_name last_name <<<"$item"
  if ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh get --config /tmp/studiobalance-preview-kcadm.config 'users?username=$username&exact=true' -r '$realm' 2>/dev/null" | grep -q '"id"'; then
    echo "Preview account $username already exists; refusing to replace its password." >&2
    exit 1
  fi
done

cleanup() {
  ssh docker.home.cz "docker exec keycloak rm -f /tmp/studiobalance-preview-kcadm.config" >/dev/null 2>&1 || true
  unset admin_password KEYCLOAK_MASTER_PASSWORD
}
trap cleanup EXIT
printf '%s\n' "$admin_password" | ssh docker.home.cz \
  "docker exec -i keycloak sh -c 'IFS= read -r KC_CLI_PASSWORD; export KC_CLI_PASSWORD; exec /opt/keycloak/bin/kcadm.sh config credentials --config /tmp/studiobalance-preview-kcadm.config --server $issuer --realm master --user '\''$admin_user'\'''"

for item in "${accounts[@]}"; do
  IFS='|' read -r username first_name last_name <<<"$item"
  password="$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-20)Aa1!"
  ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh create --config /tmp/studiobalance-preview-kcadm.config users -r '$realm' -s 'username=$username' -s 'email=$username' -s 'enabled=true' -s 'emailVerified=true' -s 'firstName=$first_name' -s 'lastName=$last_name' && docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles --config /tmp/studiobalance-preview-kcadm.config -r '$realm' --uusername '$username' --rolename client && docker exec keycloak /opt/keycloak/bin/kcadm.sh set-password --config /tmp/studiobalance-preview-kcadm.config -r '$realm' --username '$username' --new-password '$password'"
  printf 'USERNAME=%s\nPASSWORD=%s\n' "$username" "$password"
done

echo "Both preview accounts are email-verified and have only the client role. Store the passwords in the approved secret channel, then delete them from the local terminal history."

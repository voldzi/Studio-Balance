#!/usr/bin/env bash
set -euo pipefail

realm="studio-balance"
issuer="https://login.zeleznalady.cz"
username="${STUDIO_BALANCE_ADMIN_USERNAME:-}"
config_path="/tmp/studiobalance-admin-kcadm.$$.config"

for command in ssh openssl; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }
done
if [[ -z "$username" ]]; then
  read -r -p "E-mail for the named Studio Balance administrator: " username
fi
if [[ ! "$username" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "A valid administrator e-mail is required." >&2
  exit 2
fi
read -r -p "First name [Správa]: " first_name
first_name="${first_name:-Správa}"
read -r -p "Last name [Studia]: " last_name
last_name="${last_name:-Studia}"
if [[ "$first_name" == *"'"* || "$first_name" == *"\\"* || "$last_name" == *"'"* || "$last_name" == *"\\"* ]]; then
  echo "Names must not contain quotes or backslashes." >&2
  exit 2
fi
read -r -p "Keycloak master admin user [admin]: " admin_user
admin_user="${admin_user:-admin}"
if [[ ! "$admin_user" =~ ^[A-Za-z0-9._@-]{1,128}$ ]]; then
  echo "The Keycloak master administrator username contains unsupported characters." >&2
  exit 2
fi
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

existing="$(ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh get --config '$config_path' 'users?username=$username&exact=true' -r '$realm'")"
if grep -q '"id"' <<<"$existing"; then
  read -r -p "Account $username exists. Reset its password and require TOTP setup at the next login? [y/N]: " replace
  if [[ ! "$replace" =~ ^[Yy]$ ]]; then
    echo "No account changes were made."
    exit 0
  fi
  user_id="$(sed -n 's/.*"id" : "\([^"]*\)".*/\1/p' <<<"$existing" | head -n 1)"
  if [[ -z "$user_id" ]]; then
    echo "Existing Keycloak user ID could not be resolved." >&2
    exit 1
  fi
  ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh update --config '$config_path' 'users/$user_id' -r '$realm' -s 'enabled=true' -s 'emailVerified=true' -s 'firstName=$first_name' -s 'lastName=$last_name' -s 'requiredActions=[\"CONFIGURE_TOTP\"]'"
else
  ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh create --config '$config_path' users -r '$realm' -s 'username=$username' -s 'email=$username' -s 'enabled=true' -s 'emailVerified=true' -s 'firstName=$first_name' -s 'lastName=$last_name' -s 'requiredActions=[\"CONFIGURE_TOTP\"]'"
fi

password="$(openssl rand -base64 30 | tr -d '=+/' | cut -c1-22)Aa1!"
ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles --config '$config_path' -r '$realm' --uusername '$username' --rolename admin"
printf '%s\n' "$password" | ssh docker.home.cz \
  "docker exec -i keycloak sh -c 'IFS= read -r TARGET_PASSWORD; export KC_CLI_PASSWORD=\"\$TARGET_PASSWORD\"; exec /opt/keycloak/bin/kcadm.sh set-password --config '\''$config_path'\'' -r '\''$realm'\'' --username '\''$username'\'' --temporary'"

printf 'USERNAME=%s\nPASSWORD=%s\n' "$username" "$password"
echo "The password is temporary. The account must change it and complete the required TOTP step during its next admin login."
echo "Store the temporary password in the approved secret channel and do not send it in ordinary chat."

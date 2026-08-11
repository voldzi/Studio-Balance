#!/usr/bin/env bash
set -euo pipefail

realm="studio-balance"
issuer="https://login.zeleznalady.cz"
username="${STUDIO_BALANCE_ADMIN_USERNAME:-}"
config_path="/tmp/studiobalance-admin-kcadm.$$.config"

for command in ssh openssl node; do
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
  read -r -p "Remove existing authenticator-app (TOTP) devices and enroll again? [Y/n]: " reset_otp
  reset_otp="${reset_otp:-Y}"
  ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh update --config '$config_path' 'users/$user_id' -r '$realm' -s 'enabled=true' -s 'emailVerified=true' -s 'firstName=$first_name' -s 'lastName=$last_name' -s 'requiredActions=[\"CONFIGURE_TOTP\"]'"
else
  ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh create --config '$config_path' users -r '$realm' -s 'username=$username' -s 'email=$username' -s 'enabled=true' -s 'emailVerified=true' -s 'firstName=$first_name' -s 'lastName=$last_name' -s 'requiredActions=[\"CONFIGURE_TOTP\"]'"
  reset_otp="N"
fi

existing="$(ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh get --config '$config_path' 'users?username=$username&exact=true' -r '$realm'")"
user_id="$(sed -n 's/.*"id" : "\([^"]*\)".*/\1/p' <<<"$existing" | head -n 1)"
if [[ -z "$user_id" ]]; then
  echo "The administrator account could not be verified after update." >&2
  exit 1
fi

if [[ "$reset_otp" =~ ^[Yy]$ ]]; then
  credentials="$(ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh get --config '$config_path' 'users/$user_id/credentials' -r '$realm'")"
  while IFS= read -r credential_id; do
    [[ -n "$credential_id" ]] || continue
    ssh -n docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh delete --config '$config_path' 'users/$user_id/credentials/$credential_id' -r '$realm'"
  done < <(printf '%s' "$credentials" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const c of JSON.parse(s)){if(c.type==="otp")console.log(c.id)}})')
fi

read -rs -p "Temporary password for $username (leave blank to generate one): " password
printf '\n'
generated_password=false
if [[ -z "$password" ]]; then
  password="$(openssl rand -base64 30 | tr -d '=+/' | cut -c1-22)Aa1!"
  generated_password=true
else
  if (( ${#password} < 12 )); then
    echo "The temporary password must contain at least 12 characters." >&2
    exit 2
  fi
  read -rs -p "Repeat the temporary password: " password_confirmation
  printf '\n'
  if [[ "$password" != "$password_confirmation" ]]; then
    echo "The temporary passwords do not match." >&2
    exit 2
  fi
  unset password_confirmation
fi

ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles --config '$config_path' -r '$realm' --uusername '$username' --rolename admin"
printf '%s\n' "$password" | ssh docker.home.cz \
  "docker exec -i keycloak sh -c 'IFS= read -r TARGET_PASSWORD; export KC_CLI_PASSWORD=\"\$TARGET_PASSWORD\"; exec /opt/keycloak/bin/kcadm.sh set-password --config '\''$config_path'\'' -r '\''$realm'\'' --username '\''$username'\'' --temporary'"

account="$(ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh get --config '$config_path' 'users/$user_id' -r '$realm'")"
roles="$(ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh get --config '$config_path' 'users/$user_id/role-mappings/realm' -r '$realm'")"
grep -q '"enabled" : true' <<<"$account" || { echo "Verification failed: account is not enabled." >&2; exit 1; }
grep -q '"emailVerified" : true' <<<"$account" || { echo "Verification failed: e-mail is not verified." >&2; exit 1; }
grep -q '"name" : "admin"' <<<"$roles" || { echo "Verification failed: admin role is missing." >&2; exit 1; }

printf 'USERNAME=%s\n' "$username"
if [[ "$generated_password" == true ]]; then
  printf 'TEMPORARY_PASSWORD=%s\n' "$password"
else
  echo "The temporary password you entered is active. It is not printed or stored by this script."
fi
echo "Verified: account enabled, e-mail verified and realm role admin assigned."
echo "At the next admin login the account must change the temporary password and enroll the authenticator app."
echo "Open: https://studiobalance.zeleznalady.cz/admin/prihlaseni"

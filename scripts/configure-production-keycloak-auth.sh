#!/usr/bin/env bash
# shellcheck disable=SC2016
set -euo pipefail

realm="studio-balance"
issuer="https://login.zeleznalady.cz"
admin_client="studiobalance-admin"
flow="studio-balance-admin-browser"
config_path="/tmp/studiobalance-auth-kcadm.$$.config"

for command in ssh node; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }
done

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
  unset admin_password KEYCLOAK_MASTER_PASSWORD
}
trap cleanup EXIT

printf '%s\n' "$admin_password" | ssh docker.home.cz \
  "docker exec -i keycloak sh -c 'IFS= read -r KC_CLI_PASSWORD; export KC_CLI_PASSWORD; exec /opt/keycloak/bin/kcadm.sh config credentials --config $config_path --server $issuer --realm master --user '\''$admin_user'\'''"

remote() {
  local quoted=""
  printf -v quoted ' %q' "$@"
  ssh docker.home.cz "docker exec keycloak /opt/keycloak/bin/kcadm.sh${quoted} --config '$config_path' -r '$realm'"
}

# SMTP is intentionally not configured. Do not display registration or reset flows
# that would promise an e-mail the studio cannot send.
remote update "realms/$realm" -s verifyEmail=false -s resetPasswordAllowed=false

# The application owns the explicit "remember this device" choice. Keycloak's
# own checkbox is disabled so users do not see two competing retention controls.
# Its SSO/client session remains usable for the same 90 day ceiling with a 30 day
# idle boundary, allowing the server-held refresh token to revalidate the account.
remote update "realms/$realm" \
  -s rememberMe=false \
  -s ssoSessionIdleTimeout=2592000 \
  -s ssoSessionMaxLifespan=7776000 \
  -s clientSessionIdleTimeout=2592000 \
  -s clientSessionMaxLifespan=7776000

# Disabling realm-level verification does not remove a stale VERIFY_EMAIL action
# already stored on existing accounts. Preserve every other required action (most
# importantly UPDATE_PASSWORD and CONFIGURE_TOTP) while removing only this one.
users="$(remote get 'users?max=1000')"
while IFS=$'\t' read -r user_id required_actions; do
  [[ -n "$user_id" ]] || continue
  remote update "users/$user_id" -s "requiredActions=$required_actions"
done < <(node -e '
  const users=JSON.parse(process.argv[1]);
  for (const user of users) {
    const actions=(user.requiredActions ?? []).filter((action)=>action!=="VERIFY_EMAIL");
    if (actions.length !== (user.requiredActions ?? []).length) {
      process.stdout.write(`${user.id}\t${JSON.stringify(actions)}\n`);
    }
  }
' "$users")

flows="$(remote get authentication/flows)"
if ! node -e 'const flows=JSON.parse(process.argv[1]); process.exit(flows.some((flow)=>flow.alias===process.argv[2]) ? 0 : 1)' "$flows" "$flow"; then
  remote create authentication/flows -s "alias=$flow" -s 'description=Studio Balance administration: password and required TOTP.' -s providerId=basic-flow -s topLevel=true -s builtIn=false
fi
flows="$(remote get authentication/flows)"

ensure_execution() {
  local provider="$1"
  local executions
  executions="$(remote get "authentication/flows/$flow/executions")"
  if ! node -e 'const executions=JSON.parse(process.argv[1]); process.exit(executions.some((execution)=>execution.providerId===process.argv[2]) ? 0 : 1)' "$executions" "$provider"; then
    remote create "authentication/flows/$flow/executions/execution" -s "provider=$provider"
    executions="$(remote get "authentication/flows/$flow/executions")"
  fi
  local execution_id
  execution_id="$(node -e 'const executions=JSON.parse(process.argv[1]); const execution=executions.find((item)=>item.providerId===process.argv[2]); if (!execution) process.exit(1); process.stdout.write(execution.id)' "$executions" "$provider")"
  # This special endpoint returns an array on GET but accepts one execution
  # object on PUT. Disable kcadm's automatic GET-and-merge step, otherwise it
  # tries to deserialize the returned array as an ObjectNode and aborts.
  remote update "authentication/flows/$flow/executions" -s "id=$execution_id" -s requirement=REQUIRED -n
}

ensure_execution auth-username-password-form
ensure_execution auth-otp-form

clients="$(remote get "clients?clientId=$admin_client")"
client_id="$(node -e 'const clients=JSON.parse(process.argv[1]); if (clients.length!==1) process.exit(1); process.stdout.write(clients[0].id)' "$clients")"
flow_id="$(node -e 'const flows=JSON.parse(process.argv[1]); const flow=flows.find((item)=>item.alias===process.argv[2]); if (!flow) process.exit(1); process.stdout.write(flow.id)' "$flows" "$flow")"
remote update "clients/$client_id" -s "authenticationFlowBindingOverrides={\"browser\":\"$flow_id\"}"

# The application validates realm roles from the signed ID token. Keycloak's
# built-in roles scope adds them to access tokens by default, but not to ID
# tokens. Enable the existing realm-role mapper for ID tokens so both the web
# profile and the separately authenticated administration receive `admin`.
role_scopes="$(remote get 'client-scopes?name=roles')"
role_scope_id="$(node -e 'const scopes=JSON.parse(process.argv[1]); const scope=scopes.find((item)=>item.name==="roles"); if (!scope) process.exit(1); process.stdout.write(scope.id)' "$role_scopes")"
role_mappers="$(remote get "client-scopes/$role_scope_id/protocol-mappers/models")"
realm_role_mapper_id="$(node -e 'const mappers=JSON.parse(process.argv[1]); const mapper=mappers.find((item)=>item.name==="realm roles" && item.protocolMapper==="oidc-usermodel-realm-role-mapper"); if (!mapper) process.exit(1); process.stdout.write(mapper.id)' "$role_mappers")"
remote update "client-scopes/$role_scope_id/protocol-mappers/models/$realm_role_mapper_id" -s 'config."id.token.claim"=true'

realm_state="$(remote get "realms/$realm" --fields verifyEmail,resetPasswordAllowed,rememberMe,ssoSessionIdleTimeout,ssoSessionMaxLifespan,clientSessionIdleTimeout,clientSessionMaxLifespan)"
client_state="$(remote get "clients/$client_id" --fields clientId,authenticationFlowBindingOverrides)"
execution_state="$(remote get "authentication/flows/$flow/executions")"
users_state="$(remote get 'users?max=1000')"
realm_role_mapper_state="$(remote get "client-scopes/$role_scope_id/protocol-mappers/models/$realm_role_mapper_id")"
node -e '
  const realm=JSON.parse(process.argv[1]);
  const client=JSON.parse(process.argv[2]);
  const executions=JSON.parse(process.argv[3]);
  if (realm.verifyEmail!==false || realm.resetPasswordAllowed!==false) throw new Error("Simple client registration is not active.");
  const expectedSessions={rememberMe:false,ssoSessionIdleTimeout:2592000,ssoSessionMaxLifespan:7776000,clientSessionIdleTimeout:2592000,clientSessionMaxLifespan:7776000};
  for (const [name,value] of Object.entries(expectedSessions)) if (realm[name]!==value) throw new Error(`Unexpected realm session setting: ${name}`);
  if (client.authenticationFlowBindingOverrides?.browser!==process.argv[4]) throw new Error("Admin browser flow is not bound.");
  for (const provider of ["auth-username-password-form","auth-otp-form"]) {
    const execution=executions.find((item)=>item.providerId===provider);
    if (!execution || execution.requirement!=="REQUIRED") throw new Error(`Required execution missing: ${provider}`);
  }
  const users=JSON.parse(process.argv[5]);
  if (users.some((user)=>(user.requiredActions ?? []).includes("VERIFY_EMAIL"))) {
    throw new Error("A stale VERIFY_EMAIL required action remains on an account.");
  }
  const mapper=JSON.parse(process.argv[6]);
  if (mapper.config?.["id.token.claim"]!=="true") throw new Error("Realm roles are missing from ID tokens.");
' "$realm_state" "$client_state" "$execution_state" "$flow_id" "$users_state" "$realm_role_mapper_state"

echo "Configured: client registration without e-mail verification; password reset hidden until SMTP is available."
echo "Configured: Keycloak's own Remember me checkbox is hidden; SSO/client sessions are 30 days idle / 90 days maximum for secure server-side refresh."
echo "Configured: stale VERIFY_EMAIL actions removed while other account actions were preserved."
echo "Configured: studiobalance-admin requires password and TOTP for a new or expired trusted device."
echo "Configured: realm roles are included in signed ID tokens for web and administration."
echo "Administrators without an authenticator app must first enroll TOTP through their required action using the regular web login, then use /admin/prihlaseni."

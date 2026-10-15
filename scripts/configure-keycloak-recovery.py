#!/usr/bin/env python3
"""Scoped Keycloak recovery configuration. Secrets stay in owner-only files.

Run on the application server with its existing realm-management credentials.
This never reads users, changes passwords, sends mail, or grants permissions.
SMTP delivery must be independently verified before apply-recovery is allowed.
"""

import argparse
import copy
import ipaddress
import json
import os
from pathlib import Path
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request


REALM = "studio-balance"
FLOW_ALIAS = "studio-balance-password-recovery"
PROVIDERS = ("reset-credentials-choose-user", "reset-credential-email", "reset-password")
POLICY = {
    "bruteForceProtected": True,
    "permanentLockout": False,
    "maxTemporaryLockouts": 0,
    "maxSecondaryAuthFailures": 0,
    "bruteForceStrategy": "LINEAR",
    "failureFactor": 5,
    "waitIncrementSeconds": 60,
    "maxFailureWaitSeconds": 900,
    "maxDeltaTimeSeconds": 1800,
    "quickLoginCheckMilliSeconds": 1000,
    "minimumQuickLoginWaitSeconds": 60,
}
RECOVERY_KEYS = ("resetPasswordAllowed", "resetCredentialsFlow", "smtpServer", "actionTokenGeneratedByUserLifespan")
RESET_TTL_OVERRIDE = "actionTokenGeneratedByUserLifespan.reset-credentials"
SMTP_KEYS = frozenset(("host", "port", "from", "fromDisplayName", "replyTo", "replyToDisplayName", "envelopeFrom", "ssl", "starttls", "auth", "user", "password", "connectionTimeout", "timeout", "writeTimeout", "allowutf8"))


class ConfigurationError(Exception):
    """Only deliberately safe, non-secret diagnostics may leave this tool."""


def private_json(path):
    """Reject symlinks, world-readable input and unusually large secret files."""
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor) as source:
            metadata = os.fstat(source.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
                raise ConfigurationError("Configuration must be an owner-only regular file owned by this user.")
            if metadata.st_size > 65536:
                raise ConfigurationError("Configuration file is too large.")
            value = json.load(source)
    except (OSError, ValueError):
        raise ConfigurationError("Cannot read the private JSON configuration.") from None
    if not isinstance(value, dict):
        raise ConfigurationError("Configuration must contain a JSON object.")
    return value


def auth_stdin():
    try:
        raw = sys.stdin.read(65537)
        if len(raw) > 65536:
            raise ValueError()
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (OSError, ValueError):
        raise ConfigurationError("Cannot read bounded service credentials from standard input.") from None


def validate_smtp(value, approved_private_relay=False):
    if not value or not isinstance(value, dict) or set(value) - SMTP_KEYS:
        raise ConfigurationError("SMTP settings are absent or contain unsupported fields.")
    if any(not isinstance(item, str) or "\r" in item or "\n" in item or len(item) > 4096 for item in value.values()):
        raise ConfigurationError("SMTP settings must be bounded strings without line breaks.")
    host = value.get("host", "")
    if not re.fullmatch(r"[a-zA-Z0-9._:-]{1,253}", host):
        raise ConfigurationError("Invalid SMTP host.")
    try:
        port = int(value.get("port", ""))
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        raise ConfigurationError("SMTP requires an explicit valid port.") from None
    if not re.fullmatch(r"[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+", value.get("from", "")):
        raise ConfigurationError("SMTP requires a valid sender address.")
    for key in ("ssl", "starttls", "auth"):
        if value.get(key, "false") not in ("true", "false"):
            raise ConfigurationError("SMTP security switches must be true or false strings.")
    tls = value.get("ssl") == "true" or value.get("starttls") == "true"
    if value.get("ssl") == "true" and value.get("starttls") == "true":
        raise ConfigurationError("Select either SMTP TLS or STARTTLS, not both.")
    authenticated = value.get("auth") == "true"
    if authenticated and (not value.get("user") or not value.get("password") or set(value["password"]) == {"*"}):
        raise ConfigurationError("Authenticated SMTP requires an actual username and password.")
    if not (tls and authenticated):
        private_host = host == "localhost" or host.endswith(".home.cz")
        try:
            address = ipaddress.ip_address(host)
            private_host = address.is_private and not address.is_unspecified and not address.is_multicast
        except ValueError:
            pass
        if not (approved_private_relay and private_host):
            raise ConfigurationError("SMTP requires authenticated TLS or an explicitly approved private relay.")
    return copy.deepcopy(value)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


class Keycloak:
    def __init__(self, settings, allow_local_test=False):
        server = settings.get("server_url", "").rstrip("/")
        parsed = urllib.parse.urlsplit(server)
        local = allow_local_test and parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1")
        if not (local or parsed.scheme == "https") or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise ConfigurationError("Use an HTTPS server origin; HTTP requires explicit same-host loopback approval.")
        if not settings.get("client_id") or not settings.get("client_secret"):
            raise ConfigurationError("Existing realm-management service credentials are required.")
        self.server = server
        self.opener = urllib.request.build_opener(NoRedirect())
        payload = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": settings["client_id"], "client_secret": settings["client_secret"]}).encode()
        token = self.request("POST", f"/realms/{REALM}/protocol/openid-connect/token", payload, "application/x-www-form-urlencoded", authenticated=False)
        if not isinstance(token, dict) or not isinstance(token.get("access_token"), str):
            raise ConfigurationError("Keycloak did not return a service access token.")
        self.token = token["access_token"]

    def request(self, method, path, data=None, content_type="application/json", authenticated=True):
        body = json.dumps(data).encode() if data is not None and not isinstance(data, bytes) else data
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = content_type
        if authenticated:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(self.server + path, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=20) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024:
                    raise ConfigurationError("Keycloak response exceeded the bounded size limit.")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raise ConfigurationError(f"Keycloak rejected the {method} operation (HTTP {error.code}); no response body was logged.") from None
        except (OSError, ValueError):
            raise ConfigurationError("Keycloak connection or JSON response failed; no secret diagnostics were logged.") from None

    def admin(self, method, suffix="", data=None):
        return self.request(method, f"/admin/realms/{REALM}" + suffix, data)


def flow_executions(client):
    return client.admin("GET", "/authentication/flows/" + urllib.parse.quote(FLOW_ALIAS, safe="") + "/executions")


def validate_flow(executions):
    if len(executions) != len(PROVIDERS) or tuple(item.get("providerId") for item in executions) != PROVIDERS or any(item.get("authenticationFlow") for item in executions):
        raise ConfigurationError("Managed reset flow has unexpected providers or nesting; refusing to change it.")


def ensure_flow(client):
    flows = client.admin("GET", "/authentication/flows")
    existing = [flow for flow in flows if flow.get("alias") == FLOW_ALIAS]
    if len(existing) > 1:
        raise ConfigurationError("Managed reset flow alias is ambiguous.")
    if existing:
        # An existing flow may already be in use. Never silently rewrite its
        # executions/configuration without a separate reviewed migration.
        verify_flow(client)
        return
    client.admin("POST", "/authentication/flows", {"alias": FLOW_ALIAS, "description": "Password-only email recovery; enrolled OTP is preserved and fresh login is required.", "providerId": "basic-flow", "topLevel": True, "builtIn": False})
    for provider in PROVIDERS:
        client.admin("POST", f"/authentication/flows/{FLOW_ALIAS}/executions/execution", {"provider": provider})
    executions = flow_executions(client)
    validate_flow(executions)
    for execution in executions:
        if execution.get("requirement") != "REQUIRED":
            # The 26.8 endpoint uses the index/priority fields when updating.
            # Sending only id/requirement can reorder email after password.
            client.admin("PUT", f"/authentication/flows/{FLOW_ALIAS}/executions", dict(execution, requirement="REQUIRED"))
    email_execution = next(item for item in executions if item.get("providerId") == "reset-credential-email")
    config_id = email_execution.get("authenticationConfig")
    config = {"alias": "studio-balance-recovery-force-login", "config": {"force-login": "true"}}
    if config_id:
        client.admin("PUT", f"/authentication/config/{config_id}", config)
    else:
        client.admin("POST", f"/authentication/executions/{email_execution['id']}/config", config)
    verify_flow(client)


def verify_flow(client):
    executions = flow_executions(client)
    validate_flow(executions)
    if any(item.get("requirement") != "REQUIRED" for item in executions):
        raise ConfigurationError("Managed reset flow is missing required executions.")
    email = next(item for item in executions if item["providerId"] == "reset-credential-email")
    if not email.get("authenticationConfig"):
        raise ConfigurationError("Managed reset flow does not force a fresh login.")
    config = client.admin("GET", f"/authentication/config/{email['authenticationConfig']}")
    if config.get("config", {}).get("force-login") != "true":
        raise ConfigurationError("Managed reset flow does not force a fresh login.")


def save_snapshot(path, realm, fields, previous_smtp=None):
    parent = Path(path).parent
    metadata = parent.stat()
    if not parent.is_dir() or metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
        raise ConfigurationError("Snapshot directory must already exist and be owner-only.")
    if any(field not in realm or realm[field] is None for field in fields):
        raise ConfigurationError("Keycloak omitted an owned setting; cannot guarantee a reversible change on this version.")
    value = {"schema": 1, "realm": REALM, "fields": {field: copy.deepcopy(realm.get(field)) for field in fields}}
    smtp = value["fields"].get("smtpServer", {}) or {}
    if smtp.get("password") and set(smtp["password"]) == {"*"}:
        if not previous_smtp or {key: item for key, item in smtp.items() if key != "password"} != {key: item for key, item in previous_smtp.items() if key != "password"}:
            raise ConfigurationError("Keycloak redacted the prior SMTP secret; provide matching prior private SMTP settings before changing it.")
        value["fields"]["smtpServer"] = copy.deepcopy(previous_smtp)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w") as destination:
            json.dump(value, destination)
            destination.flush()
            os.fsync(destination.fileno())
    except OSError:
        raise ConfigurationError("Cannot create a new private rollback snapshot.") from None


def apply(client, mode, snapshot, smtp=None, previous_smtp=None):
    if mode not in ("apply-policy", "apply-recovery", "apply-configured-recovery"):
        raise ConfigurationError("Unsupported scoped configuration mode.")
    if mode == "apply-recovery" and (not isinstance(smtp, dict) or not smtp.get("host")):
        raise ConfigurationError("Recovery requires validated SMTP settings.")
    before = client.admin("GET")
    if before.get("realm") != REALM:
        raise ConfigurationError("Unexpected realm representation.")
    configured = mode == "apply-configured-recovery"
    if configured:
        existing = before.get("smtpServer") or {}
        if not isinstance(existing.get("password"), str) or not existing["password"]:
            raise ConfigurationError("Configured authenticated SMTP credentials are missing.")
        # Keycloak may redact this secret. Validate only connection policy and
        # require independent delivery evidence at the CLI; never export or PUT
        # SMTP settings in this mode, including during rollback.
        policy = {key: value for key, value in existing.items() if key in SMTP_KEYS}
        policy["password"] = "existing-credential-not-exported"
        validate_smtp(policy)
    patch = copy.deepcopy(POLICY)
    recovery_requested = mode in ("apply-recovery", "apply-configured-recovery")
    if recovery_requested:
        if before.get("verifyEmail") is not False:
            raise ConfigurationError("Registration verification policy differs; resolve it before recovery activation.")
        override = (before.get("attributes") or {}).get(RESET_TTL_OVERRIDE)
        if override not in (None, "900", 900):
            raise ConfigurationError("A separate reset-token lifetime override conflicts; review it before activation.")
        patch.update({"resetPasswordAllowed": True, "resetCredentialsFlow": FLOW_ALIAS, "actionTokenGeneratedByUserLifespan": 900})
        if not configured:
            patch["smtpServer"] = smtp
    save_snapshot(snapshot, before, tuple(patch), previous_smtp)
    if recovery_requested:
        ensure_flow(client)
    client.admin("PUT", data=patch)
    after = client.admin("GET")
    for field, expected in patch.items():
        if field == "smtpServer":
            # GET redacts its password; never re-use the response for a PUT.
            if any(after.get("smtpServer", {}).get(key) != value for key, value in expected.items() if key != "password"):
                raise ConfigurationError("Keycloak did not retain expected SMTP settings. Use the saved rollback snapshot.")
            continue
        if after.get(field) != expected:
            raise ConfigurationError(f"Keycloak did not preserve the expected {field} value. Use the saved rollback snapshot.")
    if configured and after.get("smtpServer") != before.get("smtpServer"):
        raise ConfigurationError("Configured SMTP changed concurrently; review the saved scoped rollback snapshot.")
    if recovery_requested:
        verify_flow(client)
        if not after.get("smtpServer", {}).get("host"):
            raise ConfigurationError("Keycloak did not retain SMTP settings. Use the saved rollback snapshot.")


def rollback(client, snapshot):
    saved = private_json(snapshot)
    fields = saved.get("fields")
    allowed = set(POLICY) | set(RECOVERY_KEYS)
    if saved.get("schema") != 1 or saved.get("realm") != REALM or not isinstance(fields, dict) or not fields or set(fields) - allowed:
        raise ConfigurationError("Rollback snapshot is not a scoped Studio Balance configuration.")
    client.admin("PUT", data=fields)
    after = client.admin("GET")
    for field, expected in fields.items():
        if field != "smtpServer" and expected is not None and after.get(field) != expected:
            raise ConfigurationError("Rollback verification failed.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("check", "apply-policy", "apply-recovery", "apply-configured-recovery", "rollback"))
    auth = parser.add_mutually_exclusive_group(required=True)
    auth.add_argument("--auth-file", help="0600 JSON: server_url, client_id, client_secret")
    auth.add_argument("--auth-stdin", action="store_true", help="Read bounded credentials JSON directly from process memory through stdin")
    parser.add_argument("--snapshot", help="New0600 snapshot, inside an existing0700 directory; input for rollback")
    parser.add_argument("--smtp-file", help="0600 JSON containing the Keycloak SMTP map")
    parser.add_argument("--previous-smtp-file", help="Prior0600 SMTP map needed for rollback when Keycloak masks an existing password")
    parser.add_argument("--smtp-delivery-verified", action="store_true", help="Operator attests independent end-to-end delivery verification")
    parser.add_argument("--approved-private-relay", action="store_true", help="Explicitly approved private SMTP relay without authenticated TLS")
    parser.add_argument("--allow-loopback", "--allow-local-test", dest="allow_local_test", action="store_true", help="Allow HTTP only to this host's explicit loopback Keycloak endpoint")
    args = parser.parse_args(argv)
    try:
        if args.mode != "check" and not args.snapshot:
            raise ConfigurationError("Every mutation requires a private rollback snapshot path.")
        smtp = None
        previous_smtp = None
        if args.mode == "apply-configured-recovery" and (not args.smtp_delivery_verified or args.smtp_file or args.previous_smtp_file):
            raise ConfigurationError("Configured recovery requires independently verified delivery and does not import SMTP files.")
        if args.mode == "apply-recovery":
            if not args.smtp_file or not args.smtp_delivery_verified:
                raise ConfigurationError("Recovery activation requires SMTP configuration and independently verified delivery.")
            smtp = validate_smtp(private_json(args.smtp_file), args.approved_private_relay)
            if args.previous_smtp_file:
                previous_smtp = validate_smtp(private_json(args.previous_smtp_file), args.approved_private_relay)
        client = Keycloak(auth_stdin() if args.auth_stdin else private_json(args.auth_file), args.allow_local_test)
        if args.mode == "check":
            realm = client.admin("GET")
            status = {"realm": REALM, "policyMatches": all(realm.get(key) == value for key, value in POLICY.items()), "recoveryEnabled": realm.get("resetPasswordAllowed") is True, "managedRecoveryFlowBound": realm.get("resetCredentialsFlow") == FLOW_ALIAS, "smtpConfigured": bool(realm.get("smtpServer", {}).get("host")), "resetTokenLifetimeSeconds": (realm.get("attributes") or {}).get(RESET_TTL_OVERRIDE, realm.get("actionTokenGeneratedByUserLifespan"))}
            if status["managedRecoveryFlowBound"]:
                verify_flow(client)
            print(json.dumps(status))
        elif args.mode == "rollback":
            rollback(client, args.snapshot)
            print("Scoped Keycloak configuration rollback verified; accounts and sessions were not changed.")
        else:
            apply(client, args.mode, args.snapshot, smtp, previous_smtp)
            print("Scoped Keycloak configuration verified; rollback snapshot saved privately. Accounts and sessions were not changed.")
        return 0
    except ConfigurationError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

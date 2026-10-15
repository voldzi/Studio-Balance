#!/usr/bin/env python3
"""Focused configuration tests; this fake never sends email or touches Keycloak."""

import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location("recovery", Path(__file__).with_name("configure-keycloak-recovery.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class FakeKeycloak:
    def __init__(self):
        self.realm = {"realm": recovery.REALM, "verifyEmail": False, "resetPasswordAllowed": False, "resetCredentialsFlow": "reset credentials", "smtpServer": {}, "actionTokenGeneratedByUserLifespan": 300, "registrationAllowed": True, "browserFlow": "browser", "adminFlow": "protected-admin", "rememberMe": False, "ssoSessionIdleTimeout": 2592000}
        self.realm.update({key: value for key, value in recovery.POLICY.items()})
        self.realm["bruteForceProtected"] = False
        self.flows = []
        self.executions = []
        self.configs = {}
        self.operations = []

    def admin(self, method, suffix="", data=None):
        self.operations.append((method, suffix, copy.deepcopy(data)))
        if suffix == "":
            if method == "GET":
                return copy.deepcopy(self.realm)
            assert method == "PUT"
            self.realm.update(copy.deepcopy(data))
        elif suffix == "/authentication/flows":
            if method == "GET":
                return copy.deepcopy(self.flows)
            assert method == "POST"
            self.flows.append(copy.deepcopy(data))
        elif suffix == f"/authentication/flows/{recovery.FLOW_ALIAS}/executions/execution":
            assert method == "POST"
            self.executions.append({"id": str(len(self.executions)), "providerId": data["provider"], "requirement": "DISABLED", "priority": len(self.executions), "index": len(self.executions)})
        elif suffix == f"/authentication/flows/{recovery.FLOW_ALIAS}/executions":
            if method == "GET":
                return copy.deepcopy(self.executions)
            assert method == "PUT"
            next(item for item in self.executions if item["id"] == data["id"]).update(copy.deepcopy(data))
        elif suffix.startswith("/authentication/executions/") and suffix.endswith("/config"):
            assert method == "POST"
            identifier = suffix.split("/")[3]
            execution = next(item for item in self.executions if item["id"] == identifier)
            execution["authenticationConfig"] = "email-config"
            self.configs["email-config"] = copy.deepcopy(data)
        elif suffix.startswith("/authentication/config/"):
            identifier = suffix.split("/")[3]
            if method == "GET":
                return copy.deepcopy(self.configs[identifier])
            assert method == "PUT"
            self.configs[identifier] = copy.deepcopy(data)
        else:
            raise AssertionError(f"Unexpected endpoint: {method} {suffix}")


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.root.chmod(0o700)
        self.client = FakeKeycloak()
        self.smtp = {"host": "smtp.example.com", "port": "587", "from": "studio@example.com", "starttls": "true", "auth": "true", "user": "studio@example.com", "password": "test-only-secret"}

    def tearDown(self):
        self.directory.cleanup()

    def private(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value))
        path.chmod(0o600)
        return path

    def test_valid_authenticated_tls_and_approved_private_relay(self):
        self.assertEqual(recovery.validate_smtp(self.smtp), self.smtp)
        relay = {"host": "mail.home.cz", "port": "25", "from": "studio@example.com"}
        self.assertEqual(recovery.validate_smtp(relay, True), relay)

    def test_plain_public_smtp_and_unapproved_private_relay_are_rejected(self):
        for host in ("smtp.example.com", "mail.home.cz", "127.0.0.1"):
            relay = {"host": host, "port": "25", "from": "studio@example.com"}
            with self.subTest(host=host), self.assertRaises(recovery.ConfigurationError):
                recovery.validate_smtp(relay)
        with self.assertRaises(recovery.ConfigurationError):
            recovery.validate_smtp({"host": "smtp.example.com", "port": "25", "from": "studio@example.com"}, True)

    def test_smtp_bad_credentials_headers_flags_and_unknown_fields_fail_closed(self):
        for key, value in (("host", "https://evil.example"), ("port", "0"), ("port", "65536"), ("from", "no-address"), ("user", ""), ("password", "**********"), ("password", ""), ("ssl", "true"), ("auth", "True"), ("starttls", "false"), ("fromDisplayName", "studio\r\nBcc: other@example.com"), ("unsupported", "x")):
            candidate = dict(self.smtp, **{key: value})
            with self.subTest(key=key, value=value), self.assertRaises(recovery.ConfigurationError):
                recovery.validate_smtp(candidate)

    def test_secret_files_reject_public_permissions_symlink_and_invalid_json(self):
        file = self.private("settings.json", {"client_secret": "not-for-output"})
        self.assertEqual(recovery.private_json(file)["client_secret"], "not-for-output")
        file.chmod(0o644)
        with self.assertRaises(recovery.ConfigurationError):
            recovery.private_json(file)
        file.chmod(0o600)
        link = self.root / "symlink.json"
        link.symlink_to(file)
        with self.assertRaises(recovery.ConfigurationError):
            recovery.private_json(link)
        file.write_text("secret invalid json")
        with self.assertRaisesRegex(recovery.ConfigurationError, "private JSON"):
            recovery.private_json(file)

    def test_policy_only_has_no_smtp_or_recovery_dependency_and_preserves_other_policy(self):
        before = copy.deepcopy(self.client.realm)
        snapshot = self.root / "policy.json"
        recovery.apply(self.client, "apply-policy", snapshot)
        self.assertEqual(self.client.realm, dict(before, **recovery.POLICY))
        saved = recovery.private_json(snapshot)
        self.assertEqual(set(saved["fields"]), set(recovery.POLICY))
        self.assertEqual(snapshot.stat().st_mode & 0o777, 0o600)
        self.assertFalse(self.client.flows)

    def test_conflicting_per_reset_lifetime_override_fails_before_any_mutation(self):
        self.client.realm["attributes"] = {recovery.RESET_TTL_OVERRIDE: "7200"}
        with self.assertRaisesRegex(recovery.ConfigurationError, "lifetime override"):
            recovery.apply(self.client, "apply-recovery", self.root / "rollback.json", self.smtp)
        self.assertTrue(all(method == "GET" for method, _, _ in self.client.operations))

    def test_recovery_binds_only_password_flow_keeps_otp_and_requires_fresh_login(self):
        before = copy.deepcopy(self.client.realm)
        recovery.apply(self.client, "apply-recovery", self.root / "recovery.json", self.smtp)
        expected = dict(before, **recovery.POLICY, resetPasswordAllowed=True, resetCredentialsFlow=recovery.FLOW_ALIAS, smtpServer=self.smtp, actionTokenGeneratedByUserLifespan=900)
        self.assertEqual(self.client.realm, expected)
        self.assertEqual(tuple(item["providerId"] for item in self.client.executions), recovery.PROVIDERS)
        self.assertTrue(all(item["requirement"] == "REQUIRED" for item in self.client.executions))
        self.assertEqual(self.client.configs["email-config"]["config"], {"force-login": "true"})
        self.assertFalse(any("otp" in item["providerId"] for item in self.client.executions))
        self.assertFalse(any("users" in path or "logout" in path for _, path, _ in self.client.operations))

    def test_repeated_apply_does_not_duplicate_the_managed_flow(self):
        recovery.apply(self.client, "apply-recovery", self.root / "first.json", self.smtp)
        recovery.apply(self.client, "apply-recovery", self.root / "second.json", self.smtp)
        self.assertEqual(len(self.client.flows), 1)
        self.assertEqual(len(self.client.executions), 3)
        recovery.verify_flow(self.client)

    def test_required_execution_updates_preserve_real_keycloak_order_metadata(self):
        recovery.ensure_flow(self.client)
        updates = [payload for method, path, payload in self.client.operations if method == "PUT" and path.endswith("/executions")]
        self.assertEqual([(item["providerId"], item["index"], item["priority"]) for item in updates], [(provider, index, index) for index, provider in enumerate(recovery.PROVIDERS)])

    def test_unexpected_or_nested_provider_prevents_activation_without_rewriting_flow(self):
        self.client.flows.append({"alias": recovery.FLOW_ALIAS})
        self.client.executions = [{"providerId": "reset-otp", "requirement": "REQUIRED"}]
        with self.assertRaisesRegex(recovery.ConfigurationError, "unexpected providers"):
            recovery.apply(self.client, "apply-recovery", self.root / "rollback.json", self.smtp)
        self.assertFalse(self.client.realm["resetPasswordAllowed"])
        self.assertTrue((self.root / "rollback.json").exists())

    def test_force_login_is_verified_before_recovery_is_trusted(self):
        recovery.ensure_flow(self.client)
        self.client.configs["email-config"]["config"]["force-login"] = "false"
        with self.assertRaisesRegex(recovery.ConfigurationError, "fresh login"):
            recovery.verify_flow(self.client)

    def test_no_permanent_or_secondary_lockout_and_failure_reset_exceeds_max_wait(self):
        self.assertFalse(recovery.POLICY["permanentLockout"])
        self.assertEqual(recovery.POLICY["maxTemporaryLockouts"], 0)
        self.assertEqual(recovery.POLICY["maxSecondaryAuthFailures"], 0)
        self.assertGreater(recovery.POLICY["maxDeltaTimeSeconds"], recovery.POLICY["maxFailureWaitSeconds"])
        self.assertEqual(recovery.POLICY["failureFactor"], 5)

    def test_snapshot_does_not_overwrite_or_accept_shared_directory(self):
        snapshot = self.root / "rollback.json"
        recovery.save_snapshot(snapshot, self.client.realm, recovery.POLICY)
        with self.assertRaises(recovery.ConfigurationError):
            recovery.save_snapshot(snapshot, self.client.realm, recovery.POLICY)
        self.root.chmod(0o755)
        with self.assertRaises(recovery.ConfigurationError):
            recovery.save_snapshot(self.root / "other.json", self.client.realm, recovery.POLICY)

    def test_redacted_previous_smtp_secret_must_not_be_restored_as_real_password(self):
        self.client.realm["smtpServer"] = dict(self.smtp, password="**********")
        with self.assertRaisesRegex(recovery.ConfigurationError, "redacted"):
            recovery.apply(self.client, "apply-recovery", self.root / "rollback.json", self.smtp)
        self.assertFalse(any(method != "GET" for method, _, _ in self.client.operations))

    def test_matching_private_prior_smtp_settings_make_masked_credentials_reversible(self):
        self.client.realm["smtpServer"] = dict(self.smtp, password="**********")
        path = self.root / "rollback.json"
        recovery.apply(self.client, "apply-recovery", path, self.smtp, self.smtp)
        self.assertEqual(recovery.private_json(path)["fields"]["smtpServer"], self.smtp)
        wrong_prior = dict(self.smtp, host="another.example.com")
        self.client.realm["smtpServer"] = dict(self.smtp, password="**********")
        with self.assertRaisesRegex(recovery.ConfigurationError, "matching prior"):
            recovery.apply(self.client, "apply-recovery", self.root / "other.json", self.smtp, wrong_prior)

    def test_rollback_restores_only_owned_fields_and_never_removes_accounts(self):
        before = copy.deepcopy(self.client.realm)
        snapshot = self.root / "rollback.json"
        recovery.apply(self.client, "apply-recovery", snapshot, self.smtp)
        self.client.realm["registrationAllowed"] = False
        recovery.rollback(self.client, snapshot)
        self.assertEqual(self.client.realm, dict(before, registrationAllowed=False))
        self.assertEqual(len(self.client.flows), 1, "Unbound managed flow is retained safely for retry")

    def test_tampered_snapshot_cannot_mutate_roles_users_or_arbitrary_fields(self):
        for fields in ({"users": []}, {"verifyEmail": True}, {"browserFlow": "unprotected"}):
            path = self.private("tampered.json", {"schema": 1, "realm": recovery.REALM, "fields": fields})
            with self.subTest(fields=fields), self.assertRaises(recovery.ConfigurationError):
                recovery.rollback(self.client, path)

    def test_missing_smtp_attestation_prevents_even_service_authentication(self):
        stderr = io.StringIO()
        with mock.patch.object(recovery, "Keycloak") as client, contextlib.redirect_stderr(stderr):
            result = recovery.main(["apply-recovery", "--auth-file", "/does-not-exist", "--snapshot", str(self.root / "rollback.json")])
        self.assertEqual(result, 1)
        client.assert_not_called()
        self.assertIn("verified delivery", stderr.getvalue())

    def test_existing_master_configuration_never_disables_verified_password_recovery(self):
        source = Path(__file__).with_name("configure-production-keycloak-auth.sh").read_text()
        self.assertNotIn("-s resetPasswordAllowed=false", source)
        self.assertNotIn("realm.resetPasswordAllowed!==false", source)

    def test_credentials_can_remain_only_in_standard_input_without_any_secret_output(self):
        settings = {"server_url": "https://login.example.com", "client_id": "operations", "client_secret": "must-not-be-logged"}
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch.object(recovery.sys, "stdin", io.StringIO(json.dumps(settings))), mock.patch.object(recovery, "Keycloak", return_value=self.client) as client, contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = recovery.main(["check", "--auth-stdin"])
        self.assertEqual(result, 0)
        client.assert_called_once_with(settings, False)
        self.assertNotIn(settings["client_secret"], stdout.getvalue() + stderr.getvalue())

    def test_altered_existing_flow_is_not_silently_rewritten(self):
        recovery.ensure_flow(self.client)
        self.client.configs["email-config"]["config"]["force-login"] = "false"
        self.client.operations.clear()
        with self.assertRaisesRegex(recovery.ConfigurationError, "fresh login"):
            recovery.ensure_flow(self.client)
        self.assertTrue(all(method == "GET" for method, _, _ in self.client.operations))

    def test_insecure_issuer_is_rejected_before_service_secret_is_transmitted(self):
        for origin in ("http://public.example", "https://user:pass@example.com", "https://example.com/path", "https://example.com?query=1"):
            with self.subTest(origin=origin), self.assertRaises(recovery.ConfigurationError):
                recovery.Keycloak({"server_url": origin, "client_id": "operations", "client_secret": "not-for-output"})


if __name__ == "__main__":
    unittest.main()

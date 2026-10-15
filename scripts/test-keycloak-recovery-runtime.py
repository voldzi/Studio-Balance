#!/usr/bin/env python3
"""Destructive synthetic tests for a disposable loopback Keycloak26.8/Mailpit.

Never targets production. The studio-balance realm must be absent initially.
Requires KEYCLOAK_RECOVERY_TEST_ADMIN_PASSWORD and a dedicated local container.
"""

import base64
import hashlib
import hmac
from html.parser import HTMLParser
import http.cookiejar
import importlib.util
import json
import os
from pathlib import Path
import re
import struct
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


spec = importlib.util.spec_from_file_location("recovery", Path(__file__).with_name("configure-keycloak-recovery.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)
SERVER = "http://127.0.0.1:18188"
MAIL = "http://127.0.0.1:18255"
REALM = "/admin/realms/studio-balance"
CLIENT = "recovery-browser-test"
CALLBACK = "http://127.0.0.1:18189/callback"


def request(method, path, data=None, token=None):
    content_type = "application/json"
    if isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
    elif isinstance(data, str):
        data = data.encode()
        content_type = "application/x-www-form-urlencoded"
    headers = {"Content-Type": content_type}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(SERVER + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


class Page(HTMLParser):
    def __init__(self, body):
        super().__init__()
        self.forms = []
        self.links = []
        self.current = None
        self.feed(body)

    def handle_starttag(self, tag, attributes):
        item = dict(attributes)
        if tag == "form":
            self.current = {"id": item.get("id"), "action": item.get("action"), "inputs": {}}
            self.forms.append(self.current)
        elif tag == "input" and self.current is not None and item.get("name") and "disabled" not in item:
            self.current["inputs"][item["name"]] = item.get("value", "")
        elif tag == "a" and item.get("href"):
            self.links.append(item["href"])

    def handle_endtag(self, tag):
        if tag == "form":
            self.current = None


class Browser:
    def __init__(self):
        # Keycloak26.8 marks cookies Secure for trustworthy loopback origins.
        # Python's jar lacks browsers' loopback exception. This isolated jar
        # only ever talks to the fixed local test server below.
        self.cookies = http.cookiejar.CookieJar(policy=http.cookiejar.DefaultCookiePolicy(secure_protocols=("https", "wss", "http")))
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies), recovery.NoRedirect())
        self.url = ""
        self.body = ""
        self.status = 0
        self.location = ""

    def open(self, url, values=None):
        url = urllib.parse.urljoin(self.url or SERVER, url)
        for _ in range(12):
            assert urllib.parse.urlsplit(url).netloc == "127.0.0.1:18188", "Synthetic browser must stay on the dedicated loopback origin"
            req = urllib.request.Request(url, data=urllib.parse.urlencode(values).encode() if values is not None else None)
            try:
                response = self.opener.open(req, timeout=20)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                self.url = url
                self.status = response.code
                self.location = response.headers.get("Location", "")
                self.body = response.read().decode()
            if self.status in (302, 303) and self.location.startswith(SERVER):
                url = self.location
                values = None
                continue
            return Page(self.body)
        raise AssertionError("Unexpected redirect loop in synthetic browser")

    def start(self):
        verifier = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        query = urllib.parse.urlencode({"client_id": CLIENT, "redirect_uri": CALLBACK, "response_type": "code", "scope": "openid", "state": uuid.uuid4().hex, "code_challenge": challenge, "code_challenge_method": "S256"})
        return self.open(SERVER + "/realms/studio-balance/protocol/openid-connect/auth?" + query)

    def submit(self, identifier, values):
        forms = [form for form in Page(self.body).forms if form["id"] == identifier]
        assert len(forms) == 1, f"Expected synthetic form {identifier}; received status {self.status}"
        if identifier == "kc-form-login" and not list(self.cookies):
            print("Synthetic browser has no cookies; auth origin", urllib.parse.urlsplit(forms[0]["action"]).netloc)
        return self.open(forms[0]["action"], dict(forms[0]["inputs"], **values))

    def login(self, email, password):
        self.start()
        return self.submit("kc-form-login", {"username": email, "password": password})


def latest_mail(email):
    for _ in range(30):
        with urllib.request.urlopen(MAIL + "/api/v1/messages", timeout=10) as response:
            messages = json.load(response)["messages"]
        for message in messages:
            if any(item.get("Address") == email for item in message.get("To", [])):
                with urllib.request.urlopen(MAIL + "/api/v1/message/" + message["ID"], timeout=10) as response:
                    return json.load(response)
        time.sleep(0.1)
    raise AssertionError("Synthetic recovery mail was not captured")


def forgot(email):
    browser = Browser()
    page = browser.start()
    reset = next(link for link in page.links if "/login-actions/reset-credentials?" in link)
    browser.open(reset)
    browser.submit("kc-reset-password-form", {"username": email})
    return browser


def reset_link(email):
    message = latest_mail(email)
    return next(link.rstrip(".,)") for link in re.findall(r"http://[^\s<>]+", message["Text"]) if "/login-actions/action-token?" in link)


def otp(secret):
    counter = struct.pack(">Q", int(time.time()) // 30)
    digest = hmac.new(secret.encode(), counter, hashlib.sha1).digest()
    offset = digest[-1] & 15
    return str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1000000).zfill(6)


def run():
    password = os.environ["KEYCLOAK_RECOVERY_TEST_ADMIN_PASSWORD"]
    def master_auth():
        return request("POST", "/realms/master/protocol/openid-connect/token", urllib.parse.urlencode({"grant_type": "password", "client_id": "admin-cli", "username": "local-admin", "password": password}))["access_token"]
    master = master_auth()
    realm = {"realm": recovery.REALM, "enabled": True, "sslRequired": "none", "verifyEmail": False, "resetPasswordAllowed": False, "loginWithEmailAllowed": True, "registrationEmailAsUsername": True, "duplicateEmailsAllowed": False, "registrationAllowed": True, "loginTheme": "studio-balance", "internationalizationEnabled": True, "supportedLocales": ["cs", "en"], "defaultLocale": "cs"}
    request("POST", "/admin/realms", realm, master)
    try:
        def admin(method, suffix="", data=None):
            nonlocal master
            try:
                return request(method, REALM + suffix, data, master)
            except urllib.error.HTTPError as error:
                if error.code != 401:
                    raise
                master = master_auth()
                return request(method, REALM + suffix, data, master)

        secret = uuid.uuid4().hex
        admin("POST", "/clients", {"clientId": "recovery-test-operations", "enabled": True, "serviceAccountsEnabled": True, "standardFlowEnabled": False, "publicClient": False, "secret": secret})
        operations = admin("GET", "/clients?clientId=recovery-test-operations")[0]["id"]
        service_user = admin("GET", f"/clients/{operations}/service-account-user")["id"]
        management = admin("GET", "/clients?clientId=realm-management")[0]["id"]
        role = admin("GET", f"/clients/{management}/roles/manage-realm")
        admin("POST", f"/users/{service_user}/role-mappings/clients/{management}", [role])
        client = recovery.Keycloak({"server_url": SERVER, "client_id": "recovery-test-operations", "client_secret": secret}, True)
        try:
            client.admin("GET", "/users")
        except recovery.ConfigurationError as error:
            assert "403" in str(error)
        else:
            raise AssertionError("Scoped service unexpectedly has user management access")
        admin("POST", "/clients", {"clientId": CLIENT, "enabled": True, "standardFlowEnabled": True, "directAccessGrantsEnabled": False, "publicClient": True, "redirectUris": [CALLBACK], "attributes": {"pkce.code.challenge.method": "S256"}})
        smtp = {"host": os.environ["KEYCLOAK_RECOVERY_TEST_SMTP_HOST"], "port": "1025", "from": "studio@example.test", "auth": "false", "ssl": "false", "starttls": "false"}
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o700)
            policy_snapshot = Path(directory) / "policy.json"
            recovery.apply(client, "apply-policy", policy_snapshot)
            assert not admin("GET")["resetPasswordAllowed"]
            recovery.rollback(client, policy_snapshot)
            assert not admin("GET")["bruteForceProtected"]
            recovery_snapshot = Path(directory) / "recovery.json"
            try:
                recovery.apply(client, "apply-recovery", recovery_snapshot, recovery.validate_smtp(smtp, True))
            except recovery.ConfigurationError:
                print("Synthetic flow metadata:", [{key: item.get(key) for key in ("providerId", "index", "priority", "requirement", "authenticationFlow")} for item in recovery.flow_executions(client)])
                raise
            before_browser = admin("GET")["browserFlow"]
            assert admin("GET")["resetPasswordAllowed"]
            assert admin("GET")["browserFlow"] == before_browser

            identifier = uuid.uuid4().hex[:8]
            email = f"client-{identifier}@example.test"
            admin_email = f"admin-{identifier}@example.test"
            old_password = "Local-old-password-42!"
            new_password = "Local-new-password-82!"
            otp_secret = "local-recovery-synthetic-only"
            for address, mfa in ((email, False), (admin_email, True)):
                credentials = [{"type": "password", "value": old_password, "temporary": False}]
                if mfa:
                    credentials.append({"type": "otp", "secretData": json.dumps({"value": otp_secret}), "credentialData": json.dumps({"subType": "totp", "digits": 6, "counter": 0, "period": 30, "algorithm": "HmacSHA1"})})
                admin("POST", "/users", {"username": address, "email": address, "firstName": "Synthetic", "lastName": "Recovery", "enabled": True, "emailVerified": False, "credentials": credentials})
            user_id = admin("GET", "/users?exact=true&email=" + urllib.parse.quote(email))[0]["id"]
            admin_id = admin("GET", "/users?exact=true&email=" + urllib.parse.quote(admin_email))[0]["id"]
            for _ in range(5):
                wrong = Browser()
                wrong.login(email, "Incorrect-synthetic-password")
                assert "code=" not in wrong.location
                time.sleep(1.05)
            locked = admin("GET", "/attack-detection/brute-force/users/" + user_id)
            print("Synthetic lockout metadata:", {key: locked.get(key) for key in ("disabled", "numFailures", "numTemporaryLockouts")})
            assert locked["disabled"] is True and locked["numFailures"] >= 5
            print("PASS: five failed synthetic logins trigger temporary lockout")

            known_recovery = forgot(email)
            generic_message = "Pokud k zadanému e-mailu existuje účet"
            assert generic_message in known_recovery.body
            link = reset_link(email)
            resetting = Browser()
            resetting.open(link)
            resetting.submit("kc-passwd-update-form", {"password-new": new_password, "password-confirm": new_password})
            assert "code=" not in resetting.location
            unlocked = admin("GET", "/attack-detection/brute-force/users/" + user_id)
            print("Synthetic reset metadata:", {"status": resetting.status, "path": urllib.parse.urlsplit(resetting.url).path, "forms": [form["id"] for form in Page(resetting.body).forms], "disabled": unlocked.get("disabled"), "numFailures": unlocked.get("numFailures")})
            # With force-login=true26.8 ends the reset session before a full
            # authentication success clears primary failures. The first60s
            # temporary suspension expires normally; never weaken the fresh
            # login boundary or administratively unlock a real account here.
            for _ in range(70):
                if unlocked["disabled"] is False:
                    break
                time.sleep(1)
                unlocked = admin("GET", "/attack-detection/brute-force/users/" + user_id)
            assert unlocked["disabled"] is False, "Temporary suspension did not expire within its expected bound"
            good = Browser()
            good.login(email, new_password)
            assert good.location.startswith(CALLBACK) and "code=" in good.location
            assert admin("GET", "/attack-detection/brute-force/users/" + user_id)["numFailures"] == 0
            print("PASS: locked client resets by mail; after temporary wait new password works and fresh login clears failures")
            old = Browser()
            old.login(email, old_password)
            assert "code=" not in old.location and any(form["id"] == "kc-form-login" for form in Page(old.body).forms)
            print("PASS: the previous password is rejected after recovery")

            reused = Browser()
            reused.open(link)
            assert not any(form["id"] == "kc-passwd-update-form" for form in Page(reused.body).forms)
            assert "code=" not in reused.location
            print("PASS: used reset link cannot change password again")
            parsed_link = urllib.parse.urlsplit(link)
            parameters = urllib.parse.parse_qs(parsed_link.query)
            key = parameters["key"][0]
            parameters["key"] = [key[:-1] + ("a" if key[-1] != "a" else "b")]
            tampered_link = urllib.parse.urlunsplit(parsed_link._replace(query=urllib.parse.urlencode(parameters, doseq=True)))
            tampered = Browser()
            tampered.open(tampered_link)
            assert not any(form["id"] == "kc-passwd-update-form" for form in Page(tampered.body).forms)
            print("PASS: a tampered reset link cannot change password")

            before_otp = admin("GET", f"/users/{admin_id}/credentials")
            forgot(admin_email)
            admin_reset = Browser()
            admin_reset.open(reset_link(admin_email))
            admin_reset.submit("kc-passwd-update-form", {"password-new": new_password, "password-confirm": new_password})
            assert "code=" not in admin_reset.location
            after_otp = admin("GET", f"/users/{admin_id}/credentials")
            assert [item["id"] for item in before_otp if item["type"] == "otp"] == [item["id"] for item in after_otp if item["type"] == "otp"]
            admin_login = Browser()
            admin_login.login(admin_email, new_password)
            assert any(form["id"] == "kc-otp-login-form" for form in Page(admin_login.body).forms)
            admin_login.submit("kc-otp-login-form", {"otp": otp(otp_secret)})
            assert admin_login.location.startswith(CALLBACK) and "code=" in admin_login.location
            print("PASS: reset preserves enrolled OTP and new login still requires the authenticator")

            unknown = forgot(f"unknown-{identifier}@example.test")
            assert "code=" not in unknown.location
            assert generic_message in unknown.body
            print("PASS: unknown email receives a generic recovery response")

            admin("PUT", data={"actionTokenGeneratedByUserLifespan": 1})
            exp_email = f"expired-{identifier}@example.test"
            admin("POST", "/users", {"username": exp_email, "email": exp_email, "enabled": True, "credentials": [{"type": "password", "value": old_password}]})
            forgot(exp_email)
            expired_link = reset_link(exp_email)
            time.sleep(2)
            expired = Browser()
            expired.open(expired_link)
            assert not any(form["id"] == "kc-passwd-update-form" for form in Page(expired.body).forms)
            print("PASS: expired reset link cannot change password")
            admin("PUT", data={"actionTokenGeneratedByUserLifespan": 900})
            recovery.rollback(client, recovery_snapshot)
            restored = admin("GET")
            assert restored["resetPasswordAllowed"] is False and restored["resetCredentialsFlow"] == "reset credentials"
            assert restored["smtpServer"] == {} and restored["bruteForceProtected"] is False
            assert len(admin("GET", "/users?exact=true&email=" + urllib.parse.quote(email))) == 1
            print("PASS: rollback restores prior realm settings without deleting user data")
    finally:
        # This test's realm and synthetic users only. The loopback server is
        # dedicated, and refusing an existing realm avoids deleting user work.
        if not os.environ.get("KEYCLOAK_RECOVERY_TEST_KEEP_REALM"):
            request("DELETE", REALM, token=master_auth())


if __name__ == "__main__":
    run()

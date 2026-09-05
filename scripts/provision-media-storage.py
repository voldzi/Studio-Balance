#!/usr/bin/env python3
"""Run with sudo on storage.home.cz. Never print credentials or foreign data."""
import datetime
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

BUCKET = "studio-balance-media"
ENDPOINT = "http://192.168.10.162:8333"
CONFIG = Path("/srv/seaweedfs/config/s3.json")
STATE = Path("/srv/seaweedfs/studio-balance")
NS = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}


def request(credential, method, path, body=b"", query=""):
    now = datetime.datetime.now(datetime.timezone.utc)
    stamp, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    host = urllib.parse.urlsplit(ENDPOINT).netloc
    digest = hashlib.sha256(body).hexdigest()
    headers = {"host": host, "x-amz-content-sha256": digest, "x-amz-date": stamp}
    names = ";".join(sorted(headers))
    canonical = "\n".join([method, path, query, "".join(f"{k}:{headers[k]}\n" for k in sorted(headers)), names, digest])
    scope = f"{day}/us-east-1/s3/aws4_request"
    key = ("AWS4" + credential["secretKey"]).encode()
    for part in [day, "us-east-1", "s3", "aws4_request"]:
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, ("AWS4-HMAC-SHA256\n" + stamp + "\n" + scope + "\n" + hashlib.sha256(canonical.encode()).hexdigest()).encode(), hashlib.sha256).hexdigest()
    headers["Authorization"] = f'AWS4-HMAC-SHA256 Credential={credential["accessKey"]}/{scope}, SignedHeaders={names}, Signature={signature}'
    req = urllib.request.Request(ENDPOINT + path + ("?" + query if query else ""), data=body if method in ("PUT", "POST") else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def require(credential, method, path, expected, body=b"", query=""):
    status, result = request(credential, method, path, body, query)
    if status not in expected:
        raise RuntimeError(f"S3 {method} failed with status {status}; response omitted")
    return result


def save(path, data):
    with open(path, "w", encoding="utf8") as stream:
        os.chmod(path, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def main():
    if os.geteuid() != 0:
        raise RuntimeError("Run with sudo on the storage host")
    STATE.mkdir(mode=0o700, exist_ok=True)
    os.chmod(STATE, 0o700)
    with open(STATE / "provision.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        config = json.loads(CONFIG.read_text())
        if any("Admin" not in i.get("actions", []) and any(a in ("Read", "Write", "List", "Tagging") or "*" in a for a in i.get("actions", [])) for i in config["identities"]):
            raise RuntimeError("Other non-admin identities have unscoped access; review isolation first")
        admins = [i for i in config["identities"] if "Admin" in i.get("actions", []) and i.get("credentials")]
        if len(admins) != 1:
            raise RuntimeError("Expected exactly one existing infrastructure administrator")
        admin = admins[0]["credentials"][0]
        state_file = STATE / "credentials.json"
        if state_file.exists():
            identities = json.loads(state_file.read_text())
        else:
            if any(i.get("name") in ("studio-balance-app", "studio-balance-backup") for i in config["identities"]):
                raise RuntimeError("Unmanaged Studio Balance identity already exists")
            status, _ = request(admin, "HEAD", "/" + BUCKET)
            if status != 404:
                raise RuntimeError(f"Bucket is not confirmed absent (status {status}); do not adopt it automatically")
            identities = [{"name": "studio-balance-" + name, "credentials": [{"accessKey": "SB" + secrets.token_hex(12).upper(), "secretKey": secrets.token_hex(32)}], "actions": [action + ":" + BUCKET for action in actions]} for name, actions in [("app", ["Read", "Write", "List"]), ("backup", ["Read", "List"])]]
            save(state_file, json.dumps(identities))
        original = CONFIG.read_text()
        changed = False
        for identity in identities:
            existing = next((i for i in config["identities"] if i.get("name") == identity["name"]), None)
            if existing is None:
                config["identities"].append(identity)
                changed = True
            elif existing != identity:
                raise RuntimeError("Existing managed identity differs; explicit rotation required")
        if changed:
            backup = STATE / ("s3-before-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json")
            save(backup, original)
            # Preserve inode: Docker bind-mounts this individual file.
            save(CONFIG, json.dumps(config, indent=2) + "\n")
            subprocess.run(["docker", "kill", "--signal", "HUP", "seaweedfs"], check=True, stdout=subprocess.DEVNULL)
        status, _ = request(admin, "HEAD", "/" + BUCKET)
        if status == 404:
            require(admin, "PUT", "/" + BUCKET, [200])
        elif status != 200:
            raise RuntimeError("Cannot verify dedicated bucket")
        require(admin, "PUT", "/" + BUCKET, [200], b'<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>Enabled</Status></VersioningConfiguration>', "versioning=")
        versioning = require(admin, "GET", "/" + BUCKET, [200], query="versioning=")
        if b"Enabled" not in versioning:
            raise RuntimeError("Bucket versioning was not enabled")
        for identity in identities:
            cred = identity["credentials"][0]
            require(cred, "GET", "/" + BUCKET, [200], query="list-type=2&max-keys=0")
            data = "\n".join(["S3_ENDPOINT=http://storage.home.cz:8333", "S3_REGION=us-east-1", "S3_BUCKET=" + BUCKET, "S3_ACCESS_KEY_ID=" + cred["accessKey"], "S3_SECRET_ACCESS_KEY=" + cred["secretKey"], "S3_FORCE_PATH_STYLE=true", ""])
            save(STATE / (identity["name"] + ".env"), data)
        app, reader = (i["credentials"][0] for i in identities)
        probe = "/" + BUCKET + "/_checks/" + secrets.token_hex(12)
        payload = b"Studio Balance storage isolation probe"
        require(app, "PUT", probe, [200], payload)
        if require(app, "GET", probe, [200]) != payload:
            raise RuntimeError("Readback mismatch")
        require(reader, "GET", probe, [200])
        require(reader, "PUT", probe, [403], b"denied")
        try:
            urllib.request.urlopen(ENDPOINT + probe, timeout=10)
        except urllib.error.HTTPError as error:
            if error.code != 403:
                raise RuntimeError("Anonymous access was not denied with 403") from None
        else:
            raise RuntimeError("Anonymous access unexpectedly succeeded")
        # Only inspect bucket names in memory; never list foreign object contents.
        buckets = ET.fromstring(require(admin, "GET", "/", [200]))
        foreign = next((e.text for e in buckets.findall("s:Buckets/s:Bucket/s:Name", NS) if e.text != BUCKET), None)
        if foreign:
            require(app, "GET", "/" + urllib.parse.quote(foreign, safe=""), [403], query="list-type=2&max-keys=0")
        require(app, "DELETE", probe, [204])
        require(app, "GET", probe, [404])
        print(json.dumps({"bucket": BUCKET, "versioning": "Enabled", "runtimeReadWrite": "passed", "backupReadOnly": "passed", "foreignBucketDenied": bool(foreign), "credentials": "stored on storage host; not printed"}))


if __name__ == "__main__":
    main()

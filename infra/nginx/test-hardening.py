#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('dmz_hardening', Path(__file__).with_name('harden-studiobalance.py'))
hardening = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = hardening
spec.loader.exec_module(hardening)


VERSION = '8cb4b439c7413d8aadaba80760d5ef110d1fded9'


def configuration():
    return '''# Zachovat vlastní poznámku i všechny TLS a login nastavení.
server {
    listen 80;
    server_name studio-balance.cz www.studio-balance.cz login.studio-balance.cz;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    http2 on;
    server_name www.studio-balance.cz;
    include /etc/nginx/snippets/security-headers-base.conf;
    return 301 https://studio-balance.cz$request_uri;
}
server {
    listen 443 ssl;
    http2 on;
    server_name studio-balance.cz;
    include /etc/nginx/vcode-analytics/studio-balance.cz.conf;
    ssl_certificate /etc/letsencrypt/live/studio-balance.cz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/studio-balance.cz/privkey.pem;
    add_header X-Test "quoted { value; # not a comment }" always;
    location = /health { return 404; }
    location = /ready { return 404; } # keep this comment
    location /api/ {
        proxy_pass http://docker.home.cz:4281;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Request-ID $request_id;
        proxy_read_timeout 60s;
    }
    location / {
        proxy_pass http://docker.home.cz:3281;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 60s;
    }
}
server {
    listen 443 ssl;
    server_name login.studio-balance.cz;
    proxy_connect_timeout 5s;
    location ^~ /realms/ { proxy_pass http://docker.home.cz:8081; }
    location ^~ /admin/ { return 404; }
}
'''.encode()


INTERNAL = b'    location = /api/internal { return 404; }\n    location ^~ /api/internal/ { return 404; }\n'
COMPRESSION = b'''        gzip off;
        location = /api/v1/sessions {
            gzip on;
            gzip_types application/json;
            gzip_min_length 1024;
            gzip_vary on;
        }
'''


class RenderingTests(unittest.TestCase):
    def test_only_two_insertions_change_existing_bytes_and_rerun_is_identical(self):
        original = configuration()
        updated = hardening.render(original)
        self.assertEqual(updated.replace(INTERNAL, b'', 1).replace(COMPRESSION, b'', 1), original)
        self.assertEqual(hardening.render(updated), updated)
        self.assertEqual(updated.count(INTERNAL), 1)
        self.assertEqual(updated.count(COMPRESSION), 1)

    def test_crlf_files_keep_line_endings_and_unrelated_bytes(self):
        original = configuration().replace(b'\n', b'\r\n')
        updated = hardening.render(original)
        self.assertEqual(updated.replace(INTERNAL.replace(b'\n', b'\r\n'), b'', 1).replace(COMPRESSION.replace(b'\n', b'\r\n'), b'', 1), original)
        self.assertEqual(hardening.render(updated), updated)

    def test_fails_closed_for_unknown_partial_or_ambiguous_configs(self):
        cases = [
            b'',
            configuration() + b'\x00',
            b'#' * (hardening.MAX_CONFIG + 1),
            configuration().replace(b'location /api/ {', b'location /api/ {\n        gzip on;'),
            configuration().replace(b'location /api/ {', b'location /api/ {\n        gzip_types application/json;'),
            configuration().replace(b'location /api/ {', b'location /api/ {\n        location = /api/v1/sessions { gzip on; }'),
            configuration().replace(b'location = /health', b'location = /api/v1/sessions { return 200; }\n    location = /health'),
            configuration().replace(b'location = /ready { return 404; }', b'location = /ready { return 403; }'),
            configuration().replace(b'location = /health', b'location = /api/internal { return 404; }\n    location = /health'),
            configuration().replace(b'location = /health', b'location ^~ /api/internal/ { proxy_pass http://docker.home.cz:4281; }\n    location = /health'),
            configuration().replace(b'/etc/nginx/vcode-analytics/studio-balance.cz.conf', b'/etc/nginx/missing-analytics.conf'),
            configuration().replace(b'proxy_pass http://docker.home.cz:4281', b'proxy_pass http://other.home.cz:4281'),
            configuration().replace(b'X-Forwarded-For $remote_addr', b'X-Forwarded-For $proxy_add_x_forwarded_for'),
            configuration().replace(b'location /api/ {', b'location /api/ { return 404; }\n    location /api/ {'),
            configuration().replace(b'    location /api/ {\n', b'    location /api/ { proxy_pass http://docker.home.cz:4281;\n'),
            configuration() + configuration(),
            configuration()[:-3],
            configuration().replace(b'# Zachovat', b'\xff# Zachovat'),
            configuration().replace(b'    listen 443 ssl;\n', b'    listen 443 ssl;\r\n', 1),
            configuration().replace(b'"quoted { value; # not a comment }"', b'"unterminated string'),
        ]
        for candidate in cases:
            with self.subTest(candidate=candidate[:140]):
                with self.assertRaises(hardening.HardeningError):
                    hardening.render(candidate)

    def test_valid_internal_blocks_are_not_reformatted(self):
        original = configuration().replace(b'    location = /ready', b'    location = /api/internal {\n        return 404;\n    }\n    location ^~ /api/internal/ {return 404;}\n    location = /ready')
        updated = hardening.render(original)
        self.assertEqual(updated.replace(COMPRESSION, b'', 1), original)

    def test_rejects_mutated_already_installed_compression(self):
        complete = hardening.render(configuration())
        for before, after in [(b'gzip off;', b'gzip on;'), (b'gzip_types application/json;', b'gzip_types text/html;'), (b'gzip_min_length 1024;', b'gzip_min_length 100;'), (b'gzip_vary on;', b'gzip_vary off;')]:
            with self.subTest(before=before):
                with self.assertRaises(hardening.HardeningError):
                    hardening.render(complete.replace(before, after, 1))


class TransactionTests(unittest.TestCase):
    def fixture(self, directory, symlink=False):
        available = directory / 'sites-available/studio-balance.cz.conf'
        enabled = directory / 'sites-enabled/studio-balance.cz.conf'
        analytics = directory / 'vcode-analytics/studio-balance.cz.conf'
        for parent in (available.parent, enabled.parent, analytics.parent):
            parent.mkdir()
        available.write_bytes(configuration())
        if symlink:
            enabled.symlink_to(available)
        else:
            enabled.write_bytes(configuration().replace(b'proxy_read_timeout 60s;', b'proxy_read_timeout 59s;', 1))
        analytics.write_bytes(b'private synthetic include\n')
        analytics.chmod(0o600)
        available.chmod(0o640)
        if not symlink:
            enabled.chmod(0o644)
        return hardening.plan(available, enabled, analytics)

    def test_regular_and_symlink_arrangements_keep_metadata_and_independent_contents(self):
        for symlink in (False, True):
            with self.subTest(symlink=symlink), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                originals, approved, updates = self.fixture(directory, symlink)
                calls = []
                changed = hardening.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=lambda version: calls.append(('ready', version)), command=lambda command: calls.append(command))
                self.assertEqual(changed, 1 if symlink else 2)
                for original, data in updates:
                    current = hardening.snapshot(original.path)
                    self.assertEqual(current.data, data)
                    self.assertEqual((current.mode, current.uid, current.gid), (original.mode, original.uid, original.gid))
                self.assertEqual(originals[1].path.is_symlink(), symlink)
                hardening.unchanged(approved)
                self.assertEqual(calls.count(['nginx', '-t']), 2)
                self.assertEqual(calls.count(['systemctl', 'reload', 'nginx']), 1)
                self.assertEqual(calls[0], ('ready', VERSION))
                self.assertEqual(calls[-1], ('ready', VERSION))
                manifest = json.loads((directory / 'backup/manifest.json').read_text())
                self.assertEqual(manifest['analyticsSha256'], hardening.digest(approved.data))
                self.assertEqual(len(manifest['configs']), 2)

    def test_failed_upstreams_do_not_create_backups_or_modify_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            originals, approved, updates = self.fixture(directory)
            def fail(version):
                raise hardening.HardeningError('Wrong version')
            with self.assertRaises(hardening.HardeningError):
                hardening.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=fail, command=lambda command: None)
            self.assertFalse((directory / 'backup').exists())
            for original in originals + [approved]:
                hardening.unchanged(original)

    def test_preexisting_invalid_nginx_config_cannot_change_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            originals, approved, updates = self.fixture(directory)
            with self.assertRaises(hardening.HardeningError):
                hardening.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=lambda version: None, command=lambda command: (_ for _ in ()).throw(hardening.HardeningError('Invalid nginx')))
            self.assertFalse((directory / 'backup').exists())
            for original in originals:
                hardening.unchanged(original)

    def test_nginx_or_reload_or_postcheck_failure_restores_originals(self):
        for failure_point in ('syntax', 'reload', 'postcheck'):
            with self.subTest(failure=failure_point), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                originals, approved, updates = self.fixture(directory)
                calls = []
                checks = []
                def command(args):
                    calls.append(args)
                    if failure_point == 'syntax' and len(calls) == 2:
                        raise hardening.HardeningError('Candidate syntax failed')
                    if failure_point == 'reload' and len(calls) == 3:
                        raise hardening.HardeningError('Candidate reload failed')
                def check(version):
                    checks.append(version)
                    if failure_point == 'postcheck' and len(checks) == 2:
                        raise hardening.HardeningError('Postcheck failed')
                with self.assertRaisesRegex(hardening.HardeningError, 'original app configuration restored'):
                    hardening.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=check, command=command)
                for original in originals + [approved]:
                    hardening.unchanged(original)
                self.assertEqual(calls[-2:], [['nginx', '-t'], ['systemctl', 'reload', 'nginx']])

    def test_cas_rejects_external_config_or_analytics_change_before_backup(self):
        for index in (0, 1, 2):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                originals, approved, updates = self.fixture(directory)
                watched = (originals + [approved])[index]
                def command(args):
                    watched.path.write_bytes(b'# concurrent writer\n')
                with self.assertRaisesRegex(hardening.HardeningError, 'Concurrent modification'):
                    hardening.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=lambda version: None, command=command)
                self.assertFalse((directory / 'backup').exists())
                self.assertEqual(watched.path.read_bytes(), b'# concurrent writer\n')

    def test_mid_write_failure_rolls_back_first_file_and_preserves_foreign_second_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            originals, approved, updates = self.fixture(directory)
            actual = hardening.atomic_write
            writes = []
            def write(original, data):
                actual(original, data)
                writes.append(original.path)
                if len(writes) == 1:
                    originals[1].path.write_bytes(b'# concurrent second-file change\n')
            with patch.object(hardening, 'atomic_write', write), self.assertRaisesRegex(hardening.HardeningError, 'manual review'):
                hardening.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=lambda version: None, command=lambda command: None)
            hardening.unchanged(originals[0])
            self.assertEqual(originals[1].path.read_bytes(), b'# concurrent second-file change\n')

    def test_failure_after_atomic_replace_is_not_missed_by_rollback(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            originals, approved, updates = self.fixture(directory)
            actual = hardening.atomic_write
            attempted = []
            def write(original, data):
                actual(original, data)
                attempted.append(original.path)
                if len(attempted) == 1:
                    raise OSError('Simulated directory sync failure after replace')
            with patch.object(hardening, 'atomic_write', write), self.assertRaisesRegex(hardening.HardeningError, 'original app configuration restored'):
                hardening.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=lambda version: None, command=lambda command: None)
            for original in originals:
                hardening.unchanged(original)

    def test_external_change_after_candidate_does_not_get_overwritten_by_rollback(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            originals, approved, updates = self.fixture(directory)
            count = []
            def command(args):
                count.append(args)
                if len(count) == 2:
                    originals[0].path.write_bytes(b'# foreign change after install\n')
                    raise hardening.HardeningError('Concurrent change')
            with self.assertRaisesRegex(hardening.HardeningError, 'manual review'):
                hardening.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=lambda version: None, command=command)
            self.assertEqual(originals[0].path.read_bytes(), b'# foreign change after install\n')
            hardening.unchanged(originals[1])
            self.assertNotIn(['systemctl', 'reload', 'nginx'], count)

    def test_unknown_enabled_symlink_and_hardlink_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            originals, approved, _ = self.fixture(directory)
            enabled = originals[1].path
            enabled.unlink()
            enabled.symlink_to(approved.path)
            with self.assertRaises(hardening.HardeningError):
                hardening.plan(originals[0].path, enabled, approved.path)
            enabled.unlink()
            os.link(originals[0].path, enabled)
            with self.assertRaises(hardening.HardeningError):
                hardening.plan(originals[0].path, enabled, approved.path)

    def test_default_cli_dry_run_makes_no_backup_lock_reload_or_file_write(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            prepared = self.fixture(directory)
            calls = []
            with patch.object(hardening, 'require_host'), patch.object(hardening, 'plan', return_value=prepared), patch.object(hardening, 'check_upstreams', lambda version: calls.append(('ready', version))), patch.object(hardening, 'run_command', lambda command: calls.append(command)), patch.object(hardening, 'LOCK', directory / 'lock'), patch.object(hardening, 'BACKUPS', directory / 'backups'), patch.object(sys, 'argv', ['harden-studiobalance.py', '--expected-version', VERSION]), patch.object(sys, 'stdout', io.StringIO()) as output:
                hardening.main()
            self.assertEqual(json.loads(output.getvalue())['mode'], 'dry-run')
            self.assertFalse((directory / 'lock').exists())
            self.assertFalse((directory / 'backups').exists())
            self.assertNotIn(['systemctl', 'reload', 'nginx'], calls)
            for original in prepared[0] + [prepared[1]]:
                hardening.unchanged(original)


class DependencyTests(unittest.TestCase):
    def test_ready_requires_exact_version_and_status_with_bounded_response(self):
        class Response:
            def __init__(self, data=b'', status=200):
                self.data, self.status = data, status
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self, maximum):
                return self.data[:maximum]
        cases = [(json.dumps({'status': 'ok', 'version': VERSION}).encode(), 200, True), (json.dumps({'status': 'ok', 'version': VERSION[:7]}).encode(), 200, False), (json.dumps({'status': 'error', 'version': VERSION}).encode(), 200, False), (b'[]', 200, False), (b'not json', 200, False), (b'x' * 9000, 200, False), (b'{}', 503, False)]
        for data, status, valid in cases:
            with self.subTest(valid=valid, status=status):
                requests = []
                class Opener:
                    def open(self, req, timeout):
                        requests.append((req.full_url, req.get_method(), timeout))
                        return Response(data, status) if req.full_url.endswith('/ready') else Response()
                with patch.object(hardening.socket, 'getaddrinfo', return_value=[]), patch.object(hardening.request, 'build_opener', return_value=Opener()):
                    if valid:
                        hardening.check_upstreams(VERSION)
                    else:
                        with self.assertRaises(hardening.HardeningError):
                            hardening.check_upstreams(VERSION)
                self.assertEqual([method for _, method, _ in requests], ['HEAD', 'HEAD', 'GET'])

    def test_redirects_are_not_followed(self):
        self.assertIsNone(hardening.NoRedirect().redirect_request(None, None, 302, '', {}, 'http://untrusted.example/'))

    def test_future_installer_preserves_edge_forwarded_ip_and_bootstrap_checksum(self):
        directory = Path(__file__).parent
        installer = (directory / 'install-studiobalance.sh').read_bytes()
        self.assertNotIn(b'$proxy_add_x_forwarded_for', installer)
        self.assertEqual(installer.count(b'proxy_set_header X-Forwarded-For \\$remote_addr;'), 5)
        bootstrap = (directory / 'bootstrap-codex-dmz-access.sh').read_text()
        pinned = re.search(r'installer_sha256="([0-9a-f]{64})"', bootstrap).group(1)
        self.assertEqual(pinned, hashlib.sha256(installer).hexdigest())
        subprocess.run(['bash', '-n', str(directory / 'install-studiobalance.sh')], check=True)


if __name__ == '__main__':
    unittest.main()

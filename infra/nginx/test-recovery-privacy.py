#!/usr/bin/env python3
"""Narrow renderer and transaction regression tests; no real service access."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('recovery_privacy', Path(__file__).with_name('harden-studiobalance-recovery.py'))
recovery = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = recovery
spec.loader.exec_module(recovery)
base = recovery.base
VERSION = '082d9ce7fda001c85deb0479a1b1fe59dcd8fb69'


def configuration():
    return b'''# Existing custom deployment comment.
server {
    listen 80;
    listen [::]:80;
    server_name studio-balance.cz www.studio-balance.cz login.studio-balance.cz;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name studio-balance.cz;
    include /etc/nginx/vcode-analytics/studio-balance.cz.conf;
    access_log /var/log/nginx/studiobalance.access.log;
    location /api/ { proxy_pass http://docker.home.cz:4281; }
    location / { proxy_pass http://docker.home.cz:3281; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name login.studio-balance.cz;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_certificate /etc/letsencrypt/live/studio-balance.cz/fullchain.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    client_max_body_size 20m;
    proxy_connect_timeout 5s;
    location ^~ /realms/ {
        proxy_pass http://docker.home.cz:8081;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
    location ^~ /resources/ { proxy_pass http://docker.home.cz:8081; }
    location ^~ /admin/ { return 404; }
    location = / { return 302 /realms/studio-balance/account; }
    location / { proxy_pass http://docker.home.cz:8081; }
}
'''


class RenderingTests(unittest.TestCase):
    def test_safe_allowlist_and_idempotent_both_identity_hosts(self):
        rendered = recovery.render(configuration())
        self.assertEqual(recovery.render(rendered), rendered)
        self.assertEqual(rendered.count(recovery.FORMAT.encode()), 1)
        top = base.clauses(rendered.decode())
        owned = [server for server in base.select(top, 'server') if recovery.named(server)]
        self.assertEqual(len(owned), 2)
        for server in owned:
            self.assertEqual(base.one(base.select(server.children, 'server_name'), 'name').args, [recovery.HOST])
            self.assertEqual(base.one(base.select(server.children, 'access_log'), 'access').args, recovery.ACCESS)
            self.assertEqual(base.one(base.select(server.children, 'error_log'), 'error').args, recovery.ERROR)
            self.assertIn(recovery.REFERRER, [item.args for item in base.select(server.children, 'add_header')])
        for forbidden in ['$request_uri', '$request"', '$args', '$http_referer', '$http_cookie', '$http_authorization', '$remote_addr', '$http_user_agent']:
            self.assertNotIn(forbidden, recovery.FORMAT)

    def test_sibling_app_and_analytics_are_byte_preserved(self):
        original = configuration().decode()
        updated = recovery.render(configuration()).decode()
        before = base.one([server for server in base.select(base.clauses(original), 'server') if base.select(server.children, 'server_name', ['studio-balance.cz'])], 'app')
        after = base.one([server for server in base.select(base.clauses(updated), 'server') if base.select(server.children, 'server_name', ['studio-balance.cz'])], 'app')
        self.assertEqual(original[before.start:before.end], updated[after.start:after.end])
        self.assertIn('# Existing custom deployment comment.', updated)
        self.assertEqual(updated.count('include /etc/nginx/vcode-analytics/studio-balance.cz.conf;'), 1)
        self.assertIn('server_name studio-balance.cz www.studio-balance.cz;\n    return 301 https://$host$request_uri;', updated)

    def test_limiter_is_post_actions_only_and_never_trusts_forwarded_header(self):
        rendered = recovery.render(configuration()).decode()
        top = base.clauses(rendered)
        rate_map = base.one(base.select(top, 'map', recovery.RATE_MAP_ARGS), 'POST map')
        self.assertEqual([(item.name, item.args) for item in rate_map.children], recovery.RATE_MAP_ROWS)
        self.assertNotIn('$http_x_forwarded_for', rendered)
        self.assertEqual(base.one(base.select(top, 'limit_req_zone'), 'zone').args, recovery.RATE_ZONE_ARGS)
        owned = [server for server in base.select(top, 'server') if recovery.named(server)]
        secure = base.one([server for server in owned if base.select(server.children, 'limit_req')], 'limited HTTPS host')
        self.assertEqual(base.one(base.select(secure.children, 'limit_req'), 'limit').args, ['zone=' + recovery.RATE_ZONE, 'burst=20', 'nodelay'])
        handler = base.one(base.select(secure.children, 'location', [recovery.RATE_LOCATION]), '429 response')
        self.assertEqual([(item.name, item.args) for item in handler.children], recovery.RATE_HANDLER_ROWS)
        self.assertNotIn('$request', recovery.RATE_HTML)
        self.assertIn('<a href="https://studio-balance.cz/prihlaseni">Zpět na přihlášení</a>', recovery.RATE_HTML)
        self.assertIn(('add_header', ['Retry-After', '60', 'always']), recovery.RATE_HANDLER_ROWS)

    def test_crlf_preserved(self):
        updated = recovery.render(configuration().replace(b'\n', b'\r\n'))
        self.assertNotIn(b'\n', updated.replace(b'\r\n', b''))
        self.assertEqual(recovery.render(updated), updated)

    def test_known_existing_server_logs_and_policy_are_replaced(self):
        original = configuration().replace(b'    client_max_body_size', b'    access_log /var/log/nginx/access.log combined;\n    error_log /var/log/nginx/error.log warn;\n    client_max_body_size')
        rendered = recovery.render(original)
        self.assertNotIn(b'access.log combined', rendered)
        self.assertNotIn(b'error.log warn', rendered)
        self.assertNotIn(b'strict-origin-when-cross-origin', rendered)

    def test_foreign_partial_ambiguous_or_override_configs_fail_closed(self):
        cases = [
            b'', b'\xff', configuration() + b'\x00',
            configuration().replace(b'listen 443 ssl;', b'listen 8443 ssl;'),
            configuration().replace(b'http://docker.home.cz:8081', b'http://foreign.invalid:8081'),
            configuration().replace(b'location ^~ /resources/', b'location ~ /resources/'),
            configuration().replace(b'        proxy_set_header', b'        error_log /tmp/leak warn;\n        proxy_set_header'),
            configuration().replace(b'        proxy_set_header', b'        access_log /tmp/leak combined;\n        proxy_set_header'),
            configuration().replace(b'        proxy_set_header', b'        add_header Other value;\n        proxy_set_header'),
            configuration().replace(b'        proxy_set_header', b'        include /tmp/unknown;\n        proxy_set_header'),
            configuration().replace(b'        proxy_set_header', b'        limit_req_dry_run on;\n        proxy_set_header'),
            configuration().replace(b'        proxy_set_header', b'        limit_req zone=foreign;\n        proxy_set_header'),
            configuration().replace(b'        proxy_set_header', b'        rewrite ^ /unlimited;\n        proxy_set_header'),
            configuration().replace(b'    client_max_body_size', b'    include /tmp/unknown;\n    client_max_body_size'),
            configuration().replace(b'    client_max_body_size', b'    proxy_pass_header Referrer-Policy;\n    client_max_body_size'),
            configuration().replace(b'    client_max_body_size', b'    add_header Referrer-Policy unsafe;\n    client_max_body_size'),
            configuration().replace(b'    client_max_body_size', b'    access_log /tmp/one;\n    access_log /tmp/two;\n    client_max_body_size'),
            configuration().replace(b'return 301 https://$host$request_uri;', b'return 302 https://foreign.invalid;'),
            configuration().replace(b'server_name studio-balance.cz www.studio-balance.cz login.studio-balance.cz;', b'server_name foreign.invalid login.studio-balance.cz;'),
            ('log_format ' + recovery.FORMAT_NAME + " '$request';\n").encode() + configuration(),
            recovery.render(configuration()).replace(b'burst=20', b'burst=200'),
            recovery.render(configuration()).replace(b'rate=10r/m', b'rate=100r/m'),
            recovery.render(configuration()).replace(b'default "";', b'default $binary_remote_addr;'),
            recovery.render(configuration()).replace(b'limit_req_dry_run off;', b'limit_req_dry_run on;'),
            recovery.render(configuration()).replace(b'Retry-After 60', b'Retry-After 600'),
            configuration().replace(b'    client_max_body_size', b'    error_page 429 = @foreign;\n    client_max_body_size'),
        ]
        for number, candidate in enumerate(cases):
            with self.subTest(case=number), self.assertRaises(base.HardeningError):
                recovery.render(candidate)


class TransactionTests(unittest.TestCase):
    def prepared(self, directory):
        available, enabled, analytics = [directory / name for name in ['available', 'enabled', 'analytics']]
        available.write_bytes(configuration())
        enabled.write_bytes(configuration())
        analytics.write_bytes(b'# private analytics content must never print\n')
        with patch.object(base, 'render', recovery.render):
            return base.plan(available, enabled, analytics)

    def test_failed_nginx_validation_restores_exact_copies_and_analytics(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            originals, approved, updates = self.prepared(directory)
            calls = []
            def command(args):
                calls.append(args)
                if len(calls) == 2:
                    raise base.HardeningError('Candidate syntax test failed')
            with self.assertRaisesRegex(base.HardeningError, 'original app configuration restored'):
                base.apply_updates(originals, approved, updates, VERSION, directory / 'backup', check=lambda version: None, command=command)
            for item in originals + [approved]:
                base.unchanged(item)
            self.assertEqual(calls, [['nginx', '-t'], ['nginx', '-t'], ['nginx', '-t'], ['systemctl', 'reload', 'nginx']])

    def test_cli_dryrun_reuses_transaction_without_writes_or_secret_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            prepared = self.prepared(directory)
            calls = []
            with patch.object(base, 'require_host'), patch.object(base, 'plan', return_value=prepared), patch.object(base, 'check_upstreams', lambda version: calls.append(('ready', version))), patch.object(base, 'run_command', lambda command: calls.append(command)), patch.object(base, 'LOCK', directory / 'lock'), patch.object(base, 'BACKUPS', directory / 'backups'), patch.object(sys, 'argv', ['harden-studiobalance-recovery.py', '--expected-version', VERSION]), patch.object(sys, 'stdout', io.StringIO()) as output:
                recovery.main()
            result = json.loads(output.getvalue())
            self.assertEqual(result['mode'], 'dry-run')
            self.assertNotIn('private analytics content', output.getvalue())
            self.assertFalse((directory / 'lock').exists())
            self.assertFalse((directory / 'backups').exists())
            self.assertNotIn(['systemctl', 'reload', 'nginx'], calls)
            for item in prepared[0] + [prepared[1]]:
                base.unchanged(item)

    def test_installer_and_bootstrap_preserve_policy_on_future_publication(self):
        directory = Path(__file__).parent
        installer = (directory / 'install-studiobalance.sh').read_bytes()
        self.assertIn(recovery.FORMAT.encode(), installer)
        self.assertEqual(installer.count(b'access_log /var/log/nginx/studiobalance-identity.access.log studiobalance_identity_safe;'), 2)
        self.assertEqual(installer.count(b'error_log /dev/null crit;'), 2)
        self.assertIn(b'proxy_hide_header Referrer-Policy;', installer)
        self.assertIn(recovery.RATE_MAP.encode(), installer)
        self.assertIn(recovery.RATE_ZONE_DIRECTIVE.encode(), installer)
        self.assertIn(recovery.RATE_HANDLER.encode(), installer)
        for name, arguments in recovery.RATE_DIRECTIVES:
            self.assertIn((name + ' ' + ' '.join(arguments) + ';').encode(), installer)
        self.assertNotIn(b'server_name $primary_domain $www_domain $login_domain;', installer)
        pinned = re.search(r'installer_sha256="([0-9a-f]{64})"', (directory / 'bootstrap-codex-dmz-access.sh').read_text()).group(1)
        self.assertEqual(pinned, hashlib.sha256(installer).hexdigest())
        subprocess.run(['bash', '-n', str(directory / 'install-studiobalance.sh')], check=True)


if __name__ == '__main__':
    unittest.main()

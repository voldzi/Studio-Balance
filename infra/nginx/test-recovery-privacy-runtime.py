#!/usr/bin/env python3
"""Real Nginx privacy regression on owned temporary loopback listeners only."""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from urllib import error, request


spec = importlib.util.spec_from_file_location('recovery_runtime_unit', Path(__file__).with_name('test-recovery-privacy.py'))
unit = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = unit
spec.loader.exec_module(unit)
recovery, base = unit.recovery, unit.base


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(404 if '/missing' in self.path else 200)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Referrer-Policy', 'unsafe-url')
        self.end_headers()
        self.wfile.write(b'owned identity fixture')
    do_POST = do_GET
    def log_message(self, *args):
        pass


def port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


@contextmanager
def fixture():
    nginx = shutil.which('nginx')
    if not nginx:
        raise RuntimeError('A real Nginx executable is required for the isolated identity privacy gate.')
    upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
    thread = threading.Thread(target=upstream.serve_forever, daemon=True)
    thread.start()
    process = None
    try:
        with tempfile.TemporaryDirectory(prefix='studio-balance-recovery-runtime-') as temporary:
            directory = Path(temporary)
            secure_port, redirect_port = port(), port()
            while redirect_port == secure_port:
                redirect_port = port()
            for folder in ['body', 'proxy']:
                (directory / folder).mkdir()
            rendered = recovery.render(unit.configuration()).decode()
            servers = [item for item in base.select(base.clauses(rendered), 'server') if recovery.named(item)]
            https = base.one([item for item in servers if any('ssl' in value.args for value in base.select(item.children, 'listen'))], 'fixture proxy')
            redirect = base.one([item for item in servers if item is not https], 'fixture redirect')
            def content(server):
                excluded = {'listen', 'http2', 'ssl_certificate', 'include', 'server_name'}
                body = '\n'.join(rendered[item.start:item.end] for item in server.children if item.name not in excluded)
                return body.replace('http://docker.home.cz:8081', f'http://127.0.0.1:{upstream.server_port}').replace(recovery.ACCESS[0], str(directory / 'identity.log'))
            text = '\n'.join([
                'worker_processes 1;', f'pid {directory}/nginx.pid;', f'error_log {directory}/error.log notice;',
                'events { worker_connections 32; }', 'http {', recovery.FORMAT, recovery.RATE_MAP, recovery.RATE_ZONE_DIRECTIVE,
                f'access_log {directory}/global.log combined;',
                f'client_body_temp_path {directory}/body;', f'proxy_temp_path {directory}/proxy;',
                f'server {{ listen 127.0.0.1:{secure_port}; server_name {recovery.HOST};', content(https),
                # This additional fixture-only route proves connection errors
                # cannot write the request query to a raw inherited error log.
                'location = /unreachable { proxy_pass http://127.0.0.1:9; proxy_connect_timeout 1s; }', '}',
                f'server {{ listen 127.0.0.1:{redirect_port}; server_name {recovery.HOST};', content(redirect), '}', '}', '',
            ])
            config = directory / 'nginx.conf'
            config.write_text(text)
            arguments = [nginx, '-p', str(directory) + '/', '-c', str(config), '-e', str(directory / 'error.log')]
            checked = subprocess.run(arguments + ['-t'], capture_output=True, timeout=5)
            if checked.returncode:
                # This stderr describes only our generated loopback fixture,
                # never the live Nginx configuration or any credential.
                raise RuntimeError('Isolated identity Nginx syntax validation failed: ' + checked.stderr.decode(errors='replace'))
            process = subprocess.Popen(arguments + ['-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError('Isolated identity Nginx exited before readiness.')
                try:
                    with socket.create_connection(('127.0.0.1', secure_port), timeout=0.1):
                        break
                except OSError:
                    time.sleep(0.02)
            else:
                raise RuntimeError('Isolated identity Nginx readiness timed out.')
            yield directory, secure_port, redirect_port
            process.terminate()
            process.wait(timeout=5)
            process = None
    finally:
        if process and process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
        upstream.shutdown()
        upstream.server_close()
        thread.join(timeout=5)


def get(listener, path, sentinel, method='GET', spoof='192.0.2.1'):
    opener = request.build_opener(request.ProxyHandler({}), base.NoRedirect())
    headers = {'Host': recovery.HOST, 'Referer': 'https://' + recovery.HOST + '/?key=' + sentinel, 'Cookie': 'smoke=' + sentinel, 'Authorization': 'Bearer ' + sentinel, 'X-Forwarded-For': spoof}
    try:
        response = opener.open(request.Request(f'http://127.0.0.1:{listener}' + path, headers=headers, method=method, data=b'synthetic=fixture' if method == 'POST' else None), timeout=3)
    except error.HTTPError as caught:
        response = caught
    with response:
        body = response.read(65536)
        return response.status, response.headers, body


class RuntimeTests(unittest.TestCase):
    def test_queries_headers_upstream_errors_and_redirect_never_leak(self):
        sentinel = 'owned-recovery-sentinel-never-a-real-token'
        with fixture() as (directory, secure, redirect):
            for path, expected in [('/realms/studio-balance/login-actions/action-token', 200), ('/resources/missing', 404), ('/unreachable', 502)]:
                status, headers, _ = get(secure, path + '?key=' + sentinel, sentinel)
                self.assertEqual(status, expected)
                self.assertEqual(headers.get_all('Referrer-Policy'), ['no-referrer'])
            status, headers, _ = get(redirect, '/realms/studio-balance/login-actions/action-token?key=' + sentinel, sentinel)
            self.assertEqual(status, 301)
            self.assertEqual(headers.get_all('Referrer-Policy'), ['no-referrer'])
            self.assertEqual(headers['Location'], 'https://' + recovery.HOST + '/realms/studio-balance/login-actions/action-token?key=' + sentinel)
            rows = [json.loads(line) for line in (directory / 'identity.log').read_text().splitlines()]
            self.assertEqual(len(rows), 4)
            self.assertEqual({row['status'] for row in rows}, {200, 301, 404, 502})
            for row in rows:
                self.assertEqual(set(row), {'timestamp', 'method', 'uri', 'status', 'duration', 'requestId'})
                self.assertNotIn('?', row['uri'])
                self.assertEqual(len(row['requestId']), 32)
            for log in directory.glob('*.log'):
                self.assertNotIn(sentinel, log.read_text(), 'A synthetic secret leaked to a fixture log.')

    def test_only_post_actions_are_limited_and_spoofed_forwarded_ip_cannot_bypass(self):
        sentinel = 'owned-post-rate-sentinel-never-a-real-secret'
        with fixture() as (directory, secure, _):
            statuses = []
            for index in range(40):
                status, headers, body = get(secure, '/realms/studio-balance/login-actions/reset-credentials?key=' + sentinel, sentinel, method='POST', spoof='192.0.2.' + str(index + 1))
                statuses.append(status)
                if status == 429:
                    self.assertEqual(headers['Retry-After'], '60')
                    self.assertEqual(headers.get_all('Referrer-Policy'), ['no-referrer'])
                    self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
                    self.assertIn('max-age=31536000', headers['Strict-Transport-Security'])
                    self.assertIn('Chvilku prosím počkejte', body.decode())
                    self.assertIn('<a href="https://studio-balance.cz/prihlaseni">Zpět na přihlášení</a>', body.decode())
                    self.assertNotIn(sentinel.encode(), body)
            self.assertEqual(statuses[0], 200)
            self.assertEqual(statuses[-1], 429)
            self.assertEqual(set(statuses), {200, 429})
            for method, path in [('GET', '/realms/studio-balance/login-actions/authenticate'), ('GET', '/resources/theme.css'), ('POST', '/resources/theme.css'), ('POST', '/realms/studio-balance/protocol/openid-connect/token'), ('POST', '/realms/another-realm/login-actions/reset-credentials')]:
                self.assertEqual(get(secure, path, sentinel, method=method)[0], 200)
            for log in directory.glob('*.log'):
                self.assertNotIn(sentinel, log.read_text(), 'A synthetic secret leaked during throttling.')


if __name__ == '__main__':
    unittest.main()

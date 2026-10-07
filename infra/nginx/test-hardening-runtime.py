#!/usr/bin/env python3
"""Real Nginx proxy/gzip regression on isolated loopback fixture listeners.

This never loads /etc/nginx/nginx.conf, the live app config, certificates or
analytics includes. It changes no existing service and owns all temporary
files, ports, upstream data and Nginx processes it creates.
"""

from contextlib import contextmanager
import gzip
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


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    loaded = importlib.util.module_from_spec(spec)
    sys.modules[name] = loaded
    spec.loader.exec_module(loaded)
    return loaded


hardening = module('runtime_hardening', 'harden-studiobalance.py')
unit = module('runtime_fixture', 'test-hardening.py')


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.requests.append(self.path)
        private = self.path.startswith('/api/v1/me')
        body = json.dumps({'kind': 'private' if private else 'public', 'padding': 'fixture-' * 900, 'forwardedFor': self.headers.get('X-Forwarded-For')}).encode()
        self.send_response(401 if private else 200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'private, no-store' if private else 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@contextmanager
def nginx_fixture(config):
    nginx = shutil.which('nginx')
    if not nginx:
        raise RuntimeError('Runtime gate requires a real Nginx executable on the isolated Linux fixture host.')
    upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
    upstream.requests = []
    thread = threading.Thread(target=upstream.serve_forever, daemon=True)
    thread.start()
    process = None
    try:
        with tempfile.TemporaryDirectory(prefix='studio-balance-nginx-runtime-') as temporary:
            directory = Path(temporary)
            for name in ['client-body', 'proxy-temp']:
                (directory / name).mkdir()
            with socket.socket() as listener:
                listener.bind(('127.0.0.1', 0))
                port = listener.getsockname()[1]
            text = config.decode()
            canonical = hardening.one([item for item in hardening.select(hardening.clauses(text), 'server') if hardening.select(item.children, 'server_name', ['studio-balance.cz'])], 'fixture app server')
            # Exercise every production-rendered location verbatim, replacing
            # only upstream addresses with the fixture's owned loopback port.
            locations = '\n'.join(text[item.start:item.end] for item in hardening.select(canonical.children, 'location'))
            locations = locations.replace('http://docker.home.cz:4281', f'http://127.0.0.1:{upstream.server_port}').replace('http://docker.home.cz:3281', f'http://127.0.0.1:{upstream.server_port}')
            configuration = '\n'.join([
                'worker_processes 1;',
                f'pid {directory}/nginx.pid;',
                f'error_log {directory}/error.log;',
                'events { worker_connections 32; }',
                'http {',
                ' access_log off;',
                f' client_body_temp_path {directory}/client-body;',
                f' proxy_temp_path {directory}/proxy-temp;',
                # Global gzip is deliberately on: private API protection must
                # be proven by the app's gzip off, not by a disabled default.
                ' gzip on; gzip_types application/json; gzip_min_length 1024;',
                f' server {{ listen 127.0.0.1:{port}; server_name fixture.invalid;',
                locations,
                ' }',
                '}',
                '',
            ])
            file = directory / 'nginx.conf'
            file.write_text(configuration)
            arguments = [nginx, '-p', str(directory) + '/', '-c', str(file), '-e', str(directory / 'error.log')]
            result = subprocess.run(arguments + ['-t'], capture_output=True, text=True, timeout=5)
            if result.returncode:
                raise RuntimeError('Isolated runtime fixture syntax failed: ' + result.stderr)
            process = subprocess.Popen(arguments + ['-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError('Isolated runtime Nginx exited before accepting requests.')
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=0.1):
                        break
                except OSError:
                    time.sleep(0.02)
            else:
                raise RuntimeError('Isolated runtime Nginx readiness timed out.')
            yield port, upstream.requests
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


def get(port, path, encoding='gzip', via=False):
    opener = request.build_opener(request.ProxyHandler({}))
    headers = {'Accept-Encoding': encoding, 'X-Forwarded-For': '192.0.2.123', 'DNT': '1'}
    if via:
        headers['Via'] = '1.1 release-fixture'
    req = request.Request(f'http://127.0.0.1:{port}' + path, headers=headers)
    try:
        response = opener.open(req, timeout=3)
    except error.HTTPError as caught:
        response = caught
    with response:
        return response.status, response.headers, response.read(128 * 1024)


class NginxRuntimeTests(unittest.TestCase):
    def test_real_proxy_handler_gzip_privacy_and_internal_denial(self):
        updated = hardening.render(unit.configuration())
        with nginx_fixture(updated) as (port, requests):
            status, headers, wire = get(port, '/api/v1/sessions?from=fixture')
            self.assertEqual(status, 200)
            self.assertEqual(headers.get('Content-Encoding'), 'gzip')
            self.assertIn('accept-encoding', headers.get('Vary', '').lower())
            decoded = json.loads(gzip.decompress(wire))
            self.assertEqual(decoded['kind'], 'public')
            self.assertEqual(decoded['forwardedFor'], '127.0.0.1')
            self.assertGreater(len(gzip.decompress(wire)), 1024)
            self.assertLess(len(wire), len(gzip.decompress(wire)))
            for path, expected_status in [('/api/v1/me', 401), ('/api/v1/sessions/fixture', 200)]:
                status, headers, body = get(port, path)
                self.assertEqual(status, expected_status)
                self.assertIsNone(headers.get('Content-Encoding'))
                self.assertGreater(len(body), 1024)
                self.assertEqual(json.loads(body)['forwardedFor'], '127.0.0.1')
            for path in ['/api/internal', '/api/internal/', '/api/internal/auth/session', '/api/%69nternal/auth/session', '/health', '/ready']:
                self.assertEqual(get(port, path)[0], 404)
            self.assertFalse(any('/internal' in path for path in requests))

    def test_known_prior_child_failure_is_reproduced_and_upgrade_restores_proxy(self):
        fixed = hardening.render(unit.configuration())
        known_prior = fixed.replace(b'            proxy_pass http://docker.home.cz:4281;\n', b'', 1).replace(b'            gzip_proxied any;\n', b'', 1)
        with nginx_fixture(known_prior) as (port, requests):
            # Syntax succeeds but an exact child without a content handler
            # serves a static 404 rather than inheriting the parent proxy.
            self.assertEqual(get(port, '/api/v1/sessions')[0], 404)
            self.assertFalse(requests)
        with nginx_fixture(hardening.render(known_prior)) as (port, requests):
            status, headers, body = get(port, '/api/v1/sessions')
            self.assertEqual(status, 200)
            self.assertEqual(headers.get('Content-Encoding'), 'gzip')
            self.assertEqual(json.loads(gzip.decompress(body))['kind'], 'public')

    def test_via_requests_compress_only_public_list_and_known_prior_policy_is_upgraded(self):
        fixed = hardening.render(unit.configuration())
        known_prior = fixed.replace(b'            gzip_proxied any;\n', b'', 1)
        with nginx_fixture(known_prior) as (port, requests):
            self.assertEqual(get(port, '/api/v1/sessions')[1].get('Content-Encoding'), 'gzip')
            status, headers, body = get(port, '/api/v1/sessions', via=True)
            self.assertEqual(status, 200)
            self.assertIsNone(headers.get('Content-Encoding'))
            self.assertGreater(len(body), 1024)
        with nginx_fixture(hardening.render(known_prior)) as (port, requests):
            status, headers, body = get(port, '/api/v1/sessions', via=True)
            self.assertEqual(status, 200)
            self.assertEqual(headers.get('Content-Encoding'), 'gzip')
            self.assertEqual(json.loads(gzip.decompress(body))['kind'], 'public')
            identity_status, identity_headers, identity_body = get(port, '/api/v1/sessions', encoding='identity', via=True)
            self.assertEqual(identity_status, 200)
            self.assertIsNone(identity_headers.get('Content-Encoding'))
            self.assertEqual(gzip.decompress(body), identity_body)
            for path, expected_status in [('/api/v1/me', 401), ('/api/v1/sessions/fixture', 200)]:
                status, headers, body = get(port, path, via=True)
                self.assertEqual(status, expected_status)
                self.assertIsNone(headers.get('Content-Encoding'))
                self.assertGreater(len(body), 1024)


if __name__ == '__main__':
    unittest.main()

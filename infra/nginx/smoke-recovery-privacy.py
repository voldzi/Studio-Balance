#!/usr/bin/env python3
"""Run on DMZ after apply: synthetic identity requests and bounded log checks.

Uses no real account, password or action token. It reports only status/checks;
neither log content nor query values are printed. It changes no configuration.
"""
import json
from pathlib import Path
import sys
import time
from urllib import error, request
import uuid


HOST = 'login.studio-balance.cz'
ACCESS = Path('/var/log/nginx/studiobalance-identity.access.log')
LOGS = [ACCESS, Path('/var/log/nginx/access.log'), Path('/var/log/nginx/error.log'), Path('/var/log/nginx/studiobalance.access.log'), Path('/var/log/nginx/studiobalance.error.log')]


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def smoke():
    if not ACCESS.is_file():
        raise RuntimeError('The dedicated identity access log is missing; apply and validate the policy first.')
    watched = {}
    for path in LOGS:
        if path.exists():
            info = path.stat()
            if not path.is_file():
                raise RuntimeError('A monitored Nginx log is not a regular file.')
            watched[path] = (info.st_dev, info.st_ino, info.st_size)
    sentinel = 'studio-balance-privacy-smoke-' + uuid.uuid4().hex
    opener = request.build_opener(request.ProxyHandler({}), NoRedirect())
    headers = {'Referer': 'https://' + HOST + '/realms/studio-balance/login-actions/action-token?key=' + sentinel, 'Cookie': 'privacy-smoke=' + sentinel, 'Authorization': 'Bearer ' + sentinel, 'DNT': '1'}
    statuses = []
    for scheme, path in [('https', '/realms/studio-balance/login-actions/action-token'), ('https', '/resources/studio-balance-privacy-smoke-missing.css'), ('http', '/realms/studio-balance/login-actions/action-token')]:
        try:
            response = opener.open(request.Request(scheme + '://' + HOST + path + '?key=' + sentinel, headers=headers), timeout=10)
        except error.HTTPError as caught:
            response = caught
        with response:
            response.read(65536)
            if response.headers.get_all('Referrer-Policy') != ['no-referrer']:
                raise RuntimeError('The identity response does not enforce exactly one no-referrer policy.')
            if response.status >= 500 or (scheme == 'http' and response.status != 301):
                raise RuntimeError('A synthetic identity request returned an unexpected status.')
            statuses.append(response.status)
    time.sleep(0.25)
    rows = []
    for path, previous in watched.items():
        with path.open('rb') as stream:
            info = path.stat()
            if (info.st_dev, info.st_ino) != previous[:2] or info.st_size < previous[2] or info.st_size - previous[2] > 5 * 1024 * 1024:
                raise RuntimeError('Log rotation or excess concurrent traffic prevents a bounded privacy proof; rerun.')
            stream.seek(previous[2])
            appended = stream.read(5 * 1024 * 1024 + 1)
        if sentinel.encode() in appended:
            raise RuntimeError('A synthetic secret appeared in an Nginx log; do not activate password recovery.')
        if path == ACCESS:
            rows = [json.loads(line) for line in appended.splitlines()]
    targets = {'/realms/studio-balance/login-actions/action-token', '/resources/studio-balance-privacy-smoke-missing.css'}
    matching = [row for row in rows if row.get('uri') in targets]
    if len(matching) < 3 or any(set(row) != {'timestamp', 'method', 'uri', 'status', 'duration', 'requestId'} or '?' in row['uri'] for row in matching):
        raise RuntimeError('Sanitized identity log entries did not prove all synthetic requests.')
    return {'status': 'ok', 'syntheticRequests': len(statuses), 'responseStatuses': statuses, 'monitoredLogs': len(watched), 'queryAndSensitiveHeadersAbsent': True, 'noReferrerEnforced': True}


if __name__ == '__main__':
    try:
        print(json.dumps(smoke(), indent=2))
    except (OSError, ValueError, RuntimeError, error.URLError) as failure:
        # Network exception text may contain the URL: never print raw details.
        print('Studio Balance identity privacy smoke failed; inspect the protected environment and rerun.', file=sys.stderr)
        sys.exit(1)

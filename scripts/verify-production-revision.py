#!/usr/bin/env python3
"""Check the complete deployed revision without printing environment/credentials."""
import json
import re
import subprocess
import sys
import urllib.request

SERVICES = ('api', 'web', 'worker')


def revision_matches(containers, identities, version):
    if len(containers) != len(SERVICES):
        return False
    by_name = {item['Name'].lstrip('/'): item for item in containers}
    for service in SERVICES:
        item = by_name.get(f'studio-balance-production-{service}-1')
        expected = f'studiobalance/{service}:{version}'
        if not item or item['Config']['Image'] != expected or item['Image'] != identities.get(service):
            return False
        state = item['State']
        if not state.get('Running') or state.get('Restarting') or state.get('Health', {}).get('Status') != 'healthy':
            return False
        versions = [value for value in item['Config'].get('Env', []) if value.startswith('APP_VERSION=')]
        if versions != [f'APP_VERSION={version}']:
            return False
    return True


def worker_started_successfully(logs, version):
    for line in logs.splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if item.get('service') == 'studio-balance-worker' and item.get('version') == version and item.get('level') == 'info':
            if re.fullmatch(r'weekly_schedule_generated created=\d+ skipped=\d+ locked=true', item.get('message', '')):
                return True
    return False


def same_startup(before, after):
    previous = {item['Name']: item['State'].get('StartedAt') for item in before}
    current = {item['Name']: item['State'].get('StartedAt') for item in after}
    return previous == current and all(previous.values())


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=10)


def main(version):
    if not re.fullmatch(r'[0-9a-f]{7,40}', version):
        raise RuntimeError('Invalid revision')
    names = [f'studio-balance-production-{service}-1' for service in SERVICES]
    containers = json.loads(run('docker', 'inspect', *names))
    identities = {service: run('docker', 'image', 'inspect', '-f', '{{.Id}}', f'studiobalance/{service}:{version}').strip() for service in SERVICES}
    if not revision_matches(containers, identities, version):
        raise RuntimeError('Container revision or health does not match')
    worker = next(item for item in containers if item['Name'].lstrip('/') == names[2])
    logs = run('docker', 'logs', '--since', worker['State']['StartedAt'], '--tail', '100', names[2])
    if not worker_started_successfully(logs, version):
        raise RuntimeError('Worker first successful generation has not been confirmed')
    with urllib.request.urlopen('http://127.0.0.1:4281/ready', timeout=5) as response:
        if json.load(response).get('version') != version:
            raise RuntimeError('API readiness revision differs')
    with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3281/', method='HEAD'), timeout=5) as response:
        if response.status != 200:
            raise RuntimeError('Web is unavailable')
    after = json.loads(run('docker', 'inspect', *names))
    if not revision_matches(after, identities, version) or not same_startup(containers, after):
        raise RuntimeError('Container restarted during readiness verification')


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception:
        # Inspect responses contain secrets; print only a stable generic result.
        print('Production revision verification failed', file=sys.stderr)
        sys.exit(1)

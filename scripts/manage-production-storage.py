#!/usr/bin/env python3
"""Scoped retention. Never prune shared builders, volumes, or untagged images."""
import argparse
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import pathlib
import re
import shutil
import subprocess
import time

ROOT = pathlib.Path('/srv/studio-balance')
X5 = pathlib.Path('/srv/x5-production')
SHA = re.compile(r'[0-9a-f]{7,40}')

def retained_backups(snapshots, latest, verified):
    snapshots = sorted(snapshots, reverse=True)
    retained = {latest, verified}
    for key, count in [(lambda d: d.date(), 7), (lambda d: d.isocalendar()[:2], 4), (lambda d: (d.year, d.month), 3)]:
        seen = set()
        for when, child in snapshots:
            period = key(when)
            if period not in seen and len(seen) < count:
                retained.add(child.name)
                seen.add(period)
    return retained

def verify_backup(backups, directory):
    if not isinstance(directory, str) or pathlib.Path(directory).name != directory or directory.startswith('.'):
        raise RuntimeError('Invalid backup directory')
    snapshot = backups / directory
    manifest_file = snapshot / 'manifest.json'
    if snapshot.is_symlink() or not snapshot.is_dir() or manifest_file.is_symlink() or not manifest_file.is_file():
        raise RuntimeError('Retained backup or manifest missing')
    manifest = json.loads(manifest_file.read_text())
    if manifest.get('bucket') != 'studio-balance-media' or not isinstance(manifest.get('objects'), list):
        raise RuntimeError('Invalid backup manifest')
    keys = set()
    for entry in manifest['objects']:
        name, digest, size = entry.get('file'), entry.get('sha256'), entry.get('size')
        if not isinstance(name, str) or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}\.bin', name) or name != digest + '.bin':
            raise RuntimeError('Invalid backup object path')
        if not isinstance(size, int) or size < 0 or not isinstance(entry.get('key'), str) or entry['key'] in keys:
            raise RuntimeError('Invalid backup object metadata')
        keys.add(entry['key'])
        file = snapshot / name
        if file.is_symlink() or not file.is_file() or file.stat().st_size != size:
            raise RuntimeError('Retained backup object missing or incomplete')
        checksum = hashlib.sha256()
        with file.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                checksum.update(block)
        if checksum.hexdigest() != digest:
            raise RuntimeError('Retained backup checksum failed; refusing cleanup')

def verify_retained_backups(backups, retained):
    # Check every retained restore point, especially the independently verified
    # anchor, before deleting any alternative. Checksums do not replace restore drills.
    for directory in retained:
        verify_backup(backups, directory)

def run(*args):
    return subprocess.check_output(args, text=True).strip()

def protected_releases(root, ledger, containers):
    """Prove current + two rollback generations before considering any deletion."""
    versions = ledger.get('versions') if isinstance(ledger, dict) else None
    if not isinstance(versions, list) or len(versions) < 3 or any(not isinstance(v, str) or not SHA.fullmatch(v) for v in versions):
        raise RuntimeError('At least three valid verified releases are required; no cleanup')
    verified = versions[:3]
    if any(a.startswith(b) or b.startswith(a) for i, a in enumerate(verified) for b in verified[i+1:]):
        raise RuntimeError('Verified rollback releases are duplicate or ambiguous; no cleanup')
    if list(root.glob('.deploying-*')):
        raise RuntimeError('Pending deployment requires review; no cleanup')
    live = []
    for service in ['api', 'web', 'worker']:
        name = f'studio-balance-production-{service}-1'
        matches = [item for item in containers if item.get('Name', '').removeprefix('/') == name]
        if len(matches) != 1:
            raise RuntimeError('Production container inventory is incomplete; no cleanup')
        item = matches[0]
        match = re.fullmatch(r'studiobalance/' + service + r':([0-9a-f]{7,40})', item.get('Config', {}).get('Image', ''))
        if not match or item.get('State', {}).get('Status') != 'running' or item.get('State', {}).get('Health', {}).get('Status') != 'healthy':
            raise RuntimeError('Production revision is not healthy and unambiguous; no cleanup')
        live.append(match[1])
    if len(set(live)) != 1 or live[0] not in verified:
        raise RuntimeError('Production and verified release ledger disagree; no cleanup')
    keep = set(verified)
    used = {item['Image'] for item in containers}
    for item in containers:
        ref = item.get('Config', {}).get('Image', '')
        if ref.startswith('studiobalance/'):
            match = re.fullmatch(r'studiobalance/(api|web|worker):([0-9a-f]{7,40})', ref)
            if not match:
                raise RuntimeError('Unrecognized Studio Balance container reference; no cleanup')
            keep.add(match[2])
    # Sources, Compose and migrations are needed for an actual rollback.
    # Presence checks supplement the readiness ledger; they do not claim a DB restore drill.
    for version in verified:
        source = root / 'releases' / version
        if source.is_symlink() or not source.is_dir():
            raise RuntimeError('Verified rollback source is missing or unsafe; no cleanup')
        for relative in ['docker-compose.production.yml', 'infra/scripts/rollback-production.sh']:
            path = source / relative
            if any(p.is_symlink() for p in [path, *path.parents] if p != root and root in p.parents) or not path.is_file() or not path.stat().st_size:
                raise RuntimeError('Verified rollback configuration is missing or unsafe; no cleanup')
        migrations = source / 'infra/postgres/migrations'
        if any(p.is_symlink() for p in [migrations, *migrations.parents] if p != root and root in p.parents) or not migrations.is_dir():
            raise RuntimeError('Verified rollback migrations are missing or unsafe; no cleanup')
        files = list(migrations.glob('*.sql'))
        if not files or any(p.is_symlink() or not p.is_file() or not p.stat().st_size for p in files):
            raise RuntimeError('Verified rollback migration set is incomplete; no cleanup')
    for version in keep:
        for service in ['api', 'web', 'worker']:
            image = json.loads(run('docker', 'image', 'inspect', f'studiobalance/{service}:{version}'))
            if len(image) != 1 or not re.fullmatch(r'sha256:[0-9a-f]{64}', image[0].get('Id', '')):
                raise RuntimeError('Protected image identity is unavailable; no cleanup')
            for item in containers:
                if item.get('Config', {}).get('Image') == f'studiobalance/{service}:{version}' and item['Image'] != image[0]['Id']:
                    raise RuntimeError('Container image tag was moved; no cleanup')
    return keep, used

def maintain_scan_cache(root, x5, apply=False):
    """Only the approved owned cache, idle under its own lock; reports survive."""
    cache = x5 / 'cache/studio-balance/trivy'
    if not cache.exists() and not cache.is_symlink():
        return {'status': 'absent', 'reset': False}
    with open(root / '.image-scan.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status': 'busy', 'reset': False}
        subprocess.run(['bash', str(root / 'check-production-storage.sh')], check=True)
        if cache.lstat().st_dev != x5.stat().st_dev:
            raise RuntimeError('Trivy cache differs from approved X5 filesystem')
        source = pathlib.Path(__file__).with_name('maintain-production-scan-cache.py')
        spec = importlib.util.spec_from_file_location('studio_balance_scan_cache', source)
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        plan = helper.inspect_cache(cache)
        # Retention never adopts a pre-existing/unmanaged cache. The scanner
        # alone may initialize a new empty one after its X5/ownership checks.
        if apply and plan['reset'] and plan['managed']:
            helper.maintain(cache)
        return {'status': 'managed' if plan['managed'] else 'unmanaged-empty', **{key: plan[key] for key in ('reset', 'bytes', 'ageSeconds')}}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    subprocess.run(['bash', str(ROOT / 'check-production-storage.sh')], check=True)
    locks = []
    for name in ['.production-operation.lock', '.media-backup.lock']:
        stream = open(ROOT / name, 'a')
        locks.append(stream)
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Busy: no cleanup performed')
            return
    ledger = json.loads((ROOT / 'verified-releases.json').read_text())
    ids = run('docker', 'ps', '-aq').splitlines()
    containers = json.loads(run('docker', 'inspect', *ids)) if ids else []
    keep, used = protected_releases(ROOT, ledger, containers)
    removals = []
    for directory in [ROOT / 'releases', X5 / 'archives/studio-balance/releases']:
        if directory.is_dir():
            for child in directory.iterdir():
                if child.is_dir() and not child.is_symlink() and SHA.fullmatch(child.name) and child.name not in keep:
                    removals.append(child)
    artifacts = X5 / 'archives/studio-balance/artifacts'
    if artifacts.is_dir():
        removals += [p for p in artifacts.glob('*.tar') if not p.is_symlink() and SHA.fullmatch(p.stem) and p.stem not in keep]
    for category in ['staging', 'cache']:
        directory = X5 / category / 'studio-balance'
        # Only completed deployment artifacts; live web cache has its own bounded
        # policy and is never removed by this idle-job cleanup.
        completed = []
        for child in directory.glob('completed-*'):
            if not child.is_symlink() and time.time() - child.stat().st_mtime > 14 * 86400:
                removals.append(child)
            elif not child.is_symlink():
                size = sum(p.stat().st_size for p in child.rglob('*') if p.is_file() and not p.is_symlink()) if child.is_dir() else child.stat().st_size
                completed.append((child.stat().st_mtime, child, size))
        total = sum(size for _, _, size in completed)
        if total > 1024**3:
            raise RuntimeError('Completed work exceeds 1 GiB; operator review required, no extra automatic deletion')
    backups = X5 / 'backups/studio-balance/media'
    latest = json.loads((backups / 'latest.json').read_text())['directory']
    snapshots = []
    for child in backups.iterdir():
        if not child.is_dir() or child.is_symlink() or child.name.startswith('.'):
            continue
        manifest = json.loads((child / 'manifest.json').read_text())
        when = dt.datetime.fromisoformat(manifest['completedAt'].replace('Z', '+00:00'))
        snapshots.append((when, child))
    snapshots.sort(reverse=True)
    # Evidence of verification is mandatory before removing any backup.
    verified = json.loads((backups / 'verified.json').read_text())['directory']
    retained = retained_backups(snapshots, latest, verified)
    verify_retained_backups(backups, retained)
    removals += [child for _, child in snapshots if child.name not in retained]
    refs = run('docker', 'image', 'ls', '--format', '{{.Repository}}:{{.Tag}}').splitlines()
    image_removals = []
    for ref in refs:
        match = re.fullmatch(r'studiobalance/(api|web|worker):([0-9a-f]{7,40})', ref)
        if match and match[2] not in keep:
            identity = run('docker', 'image', 'inspect', '-f', '{{.Id}}', ref)
            if identity not in used:
                image_removals.append(ref)
    cache_plan = maintain_scan_cache(ROOT, X5, apply=args.apply)
    print(json.dumps({'protectedVersions': sorted(keep), 'paths': [str(p) for p in removals], 'images': image_removals, 'trivyCache': cache_plan, 'apply': args.apply}))
    if args.apply:
        image_archives = X5 / 'archives/studio-balance/images'
        image_archives.mkdir(mode=0o700, exist_ok=True)
        for version in keep:
            target = image_archives / (version + '.tar.gz')
            if not target.exists():
                estimated = sum(int(run('docker', 'image', 'inspect', '-f', '{{.Size}}', f'studiobalance/{service}:{version}')) for service in ['api', 'web', 'worker'])
                if shutil.disk_usage(image_archives).free < estimated + 5 * 1024**3:
                    raise RuntimeError('Insufficient archive space; no cleanup')
                pending = target.with_suffix('.partial')
                with open(pending, 'wb') as stream:
                    producer = subprocess.Popen(['docker', 'image', 'save', *[f'studiobalance/{service}:{version}' for service in ['api', 'web', 'worker']]], stdout=subprocess.PIPE)
                    compressor = subprocess.Popen(['gzip', '-1'], stdin=producer.stdout, stdout=stream)
                    producer.stdout.close()
                    if compressor.wait() != 0 or producer.wait() != 0:
                        raise RuntimeError('Image archive failed; no cleanup')
                subprocess.run(['gzip', '-t', str(pending)], check=True)
                pending.rename(target)
            subprocess.run(['gzip', '-t', str(target)], check=True)
        for child in image_archives.glob('*.tar.gz'):
            if SHA.fullmatch(child.name[:-7]) and child.name[:-7] not in keep:
                removals.append(child)
        for child in removals:
            shutil.rmtree(child) if child.is_dir() else child.unlink()
        for ref in image_removals:
            # No force. Docker prevents removal if a concurrent container uses it.
            subprocess.run(['docker', 'image', 'rm', ref], check=True, stdout=subprocess.DEVNULL)

if __name__ == '__main__':
    main()

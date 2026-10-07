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
    active = run('docker', 'inspect', '-f', '{{.Config.Image}}', 'studio-balance-production-web-1').split(':')[-1]
    keep = {active, *ledger['versions'][:3]}
    keep.update(p.name.removeprefix('.deploying-') for p in ROOT.glob('.deploying-*'))
    ids = run('docker', 'ps', '-aq').splitlines()
    used = set()
    if ids:
        containers = json.loads(run('docker', 'inspect', *ids))
        used = {item['Image'] for item in containers}
        for item in containers:
            ref = item['Config']['Image']
            if ref.startswith('studiobalance/'):
                keep.add(ref.split(':')[-1])
    # Retained revisions must have all three locally restorable images.
    for version in keep:
        if not SHA.fullmatch(version):
            raise RuntimeError('Invalid protected version')
        for service in ['api', 'web', 'worker']:
            run('docker', 'image', 'inspect', f'studiobalance/{service}:{version}')
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

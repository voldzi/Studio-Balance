#!/usr/bin/env python3
"""Called only under scan-production-images.sh's idle cache lock and X5 guard."""
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import time


MAX_AGE_SECONDS = 14 * 24 * 60 * 60
MAX_BYTES = 2 * 1024 * 1024 * 1024
POLICY = '.studio-balance-cache-policy.json'


def inspect_cache(cache, now=None, size_limit=MAX_BYTES):
    cache = Path(cache)
    now = time.time() if now is None else now
    info = cache.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700 or info.st_uid != os.getuid():
        raise RuntimeError('Cache must be a private owned directory, never a symlink')
    total = 0
    for directory, subdirs, files in os.walk(cache, followlinks=False):
        for name in subdirs + files:
            entry = Path(directory) / name
            item = entry.lstat()
            if stat.S_ISLNK(item.st_mode) or not (stat.S_ISDIR(item.st_mode) or stat.S_ISREG(item.st_mode)):
                raise RuntimeError('Refusing unexpected cache symlink/special file')
            if stat.S_ISREG(item.st_mode):
                total += item.st_size
    marker = cache / POLICY
    if marker.exists():
        policy = json.loads(marker.read_text())
        if policy.get('owner') != 'studio-balance' or policy.get('schema') != 1:
            raise RuntimeError('Cache ownership policy differs')
        created = policy.get('createdAt')
        if type(created) not in (int, float) or not 0 <= created <= now:
            raise RuntimeError('Invalid cache age policy')
    else:
        if any(cache.iterdir()):
            raise RuntimeError('Refusing to adopt/delete existing unmanaged cache')
        created = now
    reset = now - created >= MAX_AGE_SECONDS or total > size_limit
    return {'reset': reset, 'bytes': total, 'ageSeconds': now - created, 'createdAt': created, 'now': now, 'managed': marker.exists()}


def maintain(cache, now=None, size_limit=MAX_BYTES):
    cache = Path(cache)
    state = inspect_cache(cache, now=now, size_limit=size_limit)
    reset, created, now = state['reset'], state['createdAt'], state['now']
    marker = cache / POLICY
    if reset:
        if not shutil.rmtree.avoids_symlink_attacks:
            raise RuntimeError('Platform cannot safely clean cache')
        # The caller holds the cache lock; reset only the owned rebuildable cache.
        for entry in cache.iterdir():
            if entry.is_dir():
                shutil.rmtree(entry)
            else:
                entry.unlink()
        created = now
    pending = marker.with_name('.cache-policy.pending.json')
    pending.write_text(json.dumps({'owner': 'studio-balance', 'schema': 1, 'createdAt': created}) + '\n')
    pending.chmod(0o600)
    pending.replace(marker)
    return reset


if __name__ == '__main__':
    if len(sys.argv) != 2 or Path(sys.argv[1]) != Path('/srv/x5-production/cache/studio-balance/trivy'):
        raise SystemExit('Only the guarded Studio Balance Trivy cache is supported')
    if maintain(Path(sys.argv[1])):
        print('Reset own Trivy cache at 14-day/2-GiB idle boundary', file=sys.stderr)

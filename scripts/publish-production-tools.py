#!/usr/bin/env python3
"""Publish complete maintenance snapshots, called with both inherited locks held."""
import fcntl
import os
from pathlib import Path
import shutil
import sys
import tempfile

TOOLS = ('check-production-storage.sh', 'manage-production-storage.py',
         'maintain-production-scan-cache.py',
         'record-verified-release.py', 'verify-production-revision.py',
         'production-operation-lock.sh', 'backup-media.sh', 'media-backup.mjs',
         'install-media-backup-cron.py', 'connect-media-runtime.sh',
         'connect-registration-runtime.sh', 'activate-production-registration.sh',
         'provision-registration-control.py')


def require_lock(root, name, descriptor):
    held = os.fstat(descriptor)
    expected = (root / name).stat()
    if (held.st_dev, held.st_ino) != (expected.st_dev, expected.st_ino):
        raise RuntimeError('Inherited lock does not reference the expected inode')
    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)


def publish_tools(source, root):
    if source.is_symlink() or (source / 'scripts').is_symlink() or (source / 'infra').is_symlink():
        raise RuntimeError('Candidate source directories must not be symlinks')
    files = [(source / 'scripts' / name, root / name, 0o700) for name in TOOLS]
    files.append((source / 'infra/docker-compose.storage.yml', root / 'storage-compose.yml', 0o600))
    if any(not origin.is_file() or origin.is_symlink() for origin, _, _ in files):
        raise RuntimeError('Candidate maintenance snapshot is incomplete')
    # Prepare the full snapshot first. No live file is truncated or chmodded.
    pending = Path(tempfile.mkdtemp(prefix='.tools-pending-', dir=root))
    try:
        for origin, target, mode in files:
            copy = pending / target.name
            shutil.copyfile(origin, copy)
            copy.chmod(mode)
            with copy.open('rb+') as stream:
                os.fsync(stream.fileno())
        for _, target, _ in files:
            os.replace(pending / target.name, target)
        directory_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    finally:
        shutil.rmtree(pending)


if __name__ == '__main__':
    root = Path('/srv/studio-balance')
    require_lock(root, '.production-operation.lock', 9)
    require_lock(root, '.media-backup.lock', 8)
    publish_tools(Path(sys.argv[1]), root)

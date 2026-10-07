#!/usr/bin/env python3
import datetime as dt
import importlib.util
from pathlib import Path
import tempfile
import subprocess
import os
import unittest
import hashlib
import json
import fcntl
import time

spec = importlib.util.spec_from_file_location('storage', Path(__file__).with_name('manage-production-storage.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RetentionTests(unittest.TestCase):
    def backup(self, root, name, body=b'restore evidence'):
        folder = root / name
        folder.mkdir()
        digest = hashlib.sha256(body).hexdigest()
        (folder / (digest + '.bin')).write_bytes(body)
        (folder / 'manifest.json').write_text(json.dumps({'bucket': 'studio-balance-media', 'objects': [{'key': 'media.webp', 'file': digest + '.bin', 'sha256': digest, 'size': len(body)}]}))
        return folder / (digest + '.bin')

    def test_old_verified_anchor_is_checked_even_when_latest_is_intact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.backup(root, 'latest')
            anchor = self.backup(root, 'verified')
            anchor.write_bytes(b'damaged evidence')
            with self.assertRaises(RuntimeError):
                module.verify_retained_backups(root, {'latest', 'verified'})

    def test_retained_missing_objects_symlinks_and_directory_traversal_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            obj = self.backup(root, 'verified')
            module.verify_retained_backups(root, {'verified'})
            obj.unlink()
            with self.assertRaises(RuntimeError): module.verify_backup(root, 'verified')
            obj.symlink_to(root / 'outside')
            with self.assertRaises(RuntimeError): module.verify_backup(root, 'verified')
            with self.assertRaises(RuntimeError): module.verify_backup(root, '../outside')

    def test_days_weeks_months_and_restore_anchor(self):
        now = dt.datetime(2026, 10, 7, tzinfo=dt.timezone.utc)
        snapshots = [(now - dt.timedelta(days=i), Path(f'backup-{i}')) for i in range(130)]
        keep = module.retained_backups(snapshots, 'backup-0', 'backup-125')
        self.assertTrue({f'backup-{i}' for i in range(7)} <= keep)
        self.assertIn('backup-125', keep)
        self.assertIn('backup-37', keep)  # newest August snapshot
        self.assertNotIn('backup-90', keep)
        self.assertLessEqual(len(keep), 15)

    def test_duplicate_daily_snapshot_does_not_consume_retention_slot(self):
        now = dt.datetime(2026, 10, 7, 12, tzinfo=dt.timezone.utc)
        snapshots = [(now-dt.timedelta(hours=i), Path(f'b-{i}')) for i in range(170)]
        keep = module.retained_backups(snapshots, 'b-0', 'b-169')
        self.assertIn('b-133', keep)
        self.assertNotIn('b-1', keep)

    def test_wrong_or_absent_filesystem_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / 'findmnt'
            executable.write_text('#!/bin/sh\necho wrong-disk\n')
            executable.chmod(0o700)
            result = subprocess.run(['bash', str(Path(__file__).with_name('check-production-storage.sh'))], env={**os.environ,'PATH':directory+':'+os.environ['PATH']}, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'refusing internal-disk fallback', result.stderr)

    def test_daily_scan_cache_dry_run_and_idle_apply_preserve_audit_and_foreign_data(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root, x5 = base / 'runtime', base / 'x5'
            root.mkdir()
            (root / 'check-production-storage.sh').write_text('exit 0\n')
            cache = x5 / 'cache/studio-balance/trivy'
            cache.mkdir(parents=True, mode=0o700)
            marker = cache / '.studio-balance-cache-policy.json'
            marker.write_text(json.dumps({'owner': 'studio-balance', 'schema': 1, 'createdAt': time.time() - 15 * 86400}))
            (cache / 'db').mkdir()
            (cache / 'db/rebuildable').write_text('old own database')
            evidence = x5 / 'archives/studio-balance/image-scans/audit.json'
            evidence.parent.mkdir(parents=True)
            evidence.write_text('audit evidence')
            foreign = x5 / 'cache/masaze/keep'
            foreign.parent.mkdir(parents=True)
            foreign.write_text('foreign application')
            plan = module.maintain_scan_cache(root, x5, apply=False)
            self.assertTrue(plan['reset'])
            self.assertTrue((cache / 'db/rebuildable').exists())
            with (root / '.image-scan.lock').open('a') as holder:
                fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.assertEqual(module.maintain_scan_cache(root, x5, apply=True)['status'], 'busy')
                self.assertTrue((cache / 'db/rebuildable').exists())
            module.maintain_scan_cache(root, x5, apply=True)
            self.assertFalse((cache / 'db').exists())
            self.assertEqual(evidence.read_text(), 'audit evidence')
            self.assertEqual(foreign.read_text(), 'foreign application')

if __name__ == '__main__':
    unittest.main()

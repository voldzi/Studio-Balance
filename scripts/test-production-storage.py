#!/usr/bin/env python3
import datetime as dt
import importlib.util
from pathlib import Path
import tempfile
import subprocess
import os
import unittest

spec = importlib.util.spec_from_file_location('storage', Path(__file__).with_name('manage-production-storage.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RetentionTests(unittest.TestCase):
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

if __name__ == '__main__':
    unittest.main()

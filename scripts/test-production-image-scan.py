#!/usr/bin/env python3
"""Exercise the real scanner with disposable filesystem and fake Docker only."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('scan-production-images.sh')
HELPER = Path(__file__).with_name('maintain-production-scan-cache.py')
spec = importlib.util.spec_from_file_location('scan_cache', HELPER)
scan_cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan_cache)


class ImageScanTests(unittest.TestCase):
    def fixture(self, base, mode='clean'):
        base = Path(base)
        runtime = base / 'runtime'
        x5 = base / 'x5'
        runtime.mkdir()
        for category in ('cache', 'archives', 'staging'):
            (x5 / category / 'studio-balance').mkdir(parents=True)
        (runtime / 'check-production-storage.sh').write_text('''#!/bin/sh
[ "$SCAN_TEST_MODE" != missing_x5 ] || exit 1
''')
        scanner = base / 'scanner.sh'
        scanner.write_text(SCRIPT.read_text().replace('/srv/studio-balance', str(runtime)).replace('/srv/x5-production', str(x5)))
        (base / HELPER.name).write_text(HELPER.read_text().replace('/srv/x5-production', str(x5)))
        tools = base / 'bin'
        tools.mkdir()
        def tool(name, source):
            target = tools / name
            target.write_text('#!' + sys.executable + '\n' + source)
            target.chmod(0o700)
        tool('stat', '''import os,pathlib,sys
value=pathlib.Path(sys.argv[-1]).stat()
print({'%d':str(value.st_dev),'%a':oct(value.st_mode & 0o777)[2:],'%u':str(value.st_uid)}[sys.argv[2]])
''')
        tool('flock', '''import fcntl,sys
try: fcntl.flock(int(sys.argv[-1]),fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError: sys.exit(1)
''')
        tool('findmnt', 'import sys\nsys.exit(0)\n')
        tool('sha256sum', '''import hashlib,pathlib,sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest()+'  '+sys.argv[1])
''')
        tool('docker', '''import hashlib,json,os,pathlib,sys
args=sys.argv[1:]
base=pathlib.Path(os.environ['SCAN_TEST_ROOT'])
with (base/'trace.jsonl').open('a') as stream: stream.write(json.dumps(args)+'\\n')
mode=os.environ['SCAN_TEST_MODE']
def identity(service): return 'sha256:'+hashlib.sha256(service.encode()).hexdigest()
if args[:2]==['image','inspect']:
    ref=args[-1]
    if ref.startswith('ghcr.io/'):
        print('sha256:6d93f1ec925b37c5ce785e416b86cba056e10c8c2914a59a8ea7be18115d6764');sys.exit(0)
    service=ref.split('/')[1].split(':')[0]
    counter=base/(service+'.count')
    count=int(counter.read_text())+1 if counter.exists() else 1
    counter.write_text(str(count))
    print(identity('retagged') if mode=='retag' and service=='web' and count>=4 else identity(service))
    sys.exit(0)
if args[:2]==['image','save']:
    service=args[-1].split('/')[1].split(':')[0]
    pathlib.Path(args[args.index('--output')+1]).write_text(service)
    sys.exit(0)
if args[0]=='inspect': sys.exit(1)
assert args[0]=='run', args
mount=next(value for value in args if value.startswith('type=bind,src=') and ',dst=/image.tar,' in value)
source=mount.split('src=',1)[1].split(',dst=',1)[0]
service=pathlib.Path(source).read_text()
if mode=='failure' and service=='web': print('database unavailable',file=sys.stderr);sys.exit(2)
if mode=='empty' and service=='web': sys.exit(0)
finding={'VulnerabilityID':'CVE-test','PkgName':'fixture','InstalledVersion':'1','Severity':'HIGH'}
results=[{'Class':'os-pkgs','Type':'alpine','Packages':[{'Name':'fixture-os','Version':'1'}],'Vulnerabilities':[]}]
if not (mode=='missing_library' and service=='web'): results.append({'Class':'lang-pkgs','Type':'npm','Packages':[] if mode=='empty_coverage' and service=='web' else [{'Name':'fixture-library','Version':'1'}],'Vulnerabilities':[finding] if mode=='high' and service=='api' else []})
report={'SchemaVersion':2,'Metadata':{'ImageID':identity('wrong') if mode=='wrong_identity' and service=='web' else identity(service),'OS':{'Family':'alpine','Name':'3.22','EOSL':False}},'Results':results}
print(json.dumps(report))
sys.exit(1 if mode=='high' and service=='api' else 0)
''')
        environment = {**os.environ, 'PATH': str(tools) + os.pathsep + os.environ['PATH'], 'SCAN_TEST_ROOT': str(base), 'SCAN_TEST_MODE': mode}
        # Check that isolated Python cannot lose validation through inherited flags.
        environment['PYTHONOPTIMIZE'] = '1'
        return scanner, environment, runtime, x5

    def run_scan(self, fixture, version='abc1234'):
        scanner, environment, _, _ = fixture
        return subprocess.run(['bash', str(scanner), version], env=environment, capture_output=True, text=True, timeout=20)

    def evidence(self, x5):
        return list((x5 / 'archives/studio-balance').glob('image-scans/abc1234/*/verified.json'))

    def test_clean_exact_three_images_are_resource_limited_without_socket_or_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory)
            result = self.run_scan(fixture)
            self.assertEqual(result.returncode, 0, result.stderr)
            traces = [json.loads(line) for line in (Path(directory) / 'trace.jsonl').read_text().splitlines()]
            scans = [args for args in traces if args[0] == 'run']
            self.assertEqual(len(scans), 3)
            for args in scans:
                for flag in ('--read-only', '--cap-drop', '--security-opt', '--memory', '--cpus', '--pids-limit', '--pull=never'):
                    self.assertIn(flag, args)
                self.assertEqual(args[args.index('--severity') + 1], 'CRITICAL,HIGH')
                self.assertEqual(args[args.index('--pkg-types') + 1], 'os,library')
                self.assertEqual(args[args.index('--ignorefile') + 1], '/dev/null')
                self.assertEqual(args[args.index('--exit-code') + 1], '1')
                self.assertNotIn('--ignore-unfixed', args)
                self.assertNotIn('--skip-db-update', args)
                self.assertNotIn('--env-file', args)
                self.assertNotIn('--privileged', args)
                self.assertFalse(any('docker.sock' in item for item in args))
            report = json.loads(self.evidence(fixture[3])[0].read_text())
            self.assertEqual(report['version'], 'abc1234')
            self.assertEqual(set(report['images']), {'web', 'api', 'worker'})
            self.assertEqual(report['high'], 0)
            self.assertEqual(report['packageCoverage']['web'], {'os-pkgs': 1, 'lang-pkgs': 1})
            self.assertFalse(list((fixture[3] / 'staging/studio-balance').iterdir()))

    def test_missing_x5_refuses_cache_reports_and_docker_before_any_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory, 'missing_x5')
            result = self.run_scan(fixture)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((Path(directory) / 'trace.jsonl').exists())
            for category in ('cache', 'archives', 'staging'):
                self.assertFalse(list((fixture[3] / category / 'studio-balance').iterdir()))
            self.assertFalse((fixture[2] / '.image-scan.lock').exists())

    def test_concurrent_scan_cannot_read_images_or_write_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory)
            with (fixture[2] / '.image-scan.lock').open('a') as holder:
                fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
                result = self.run_scan(fixture)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Another Studio Balance image scan', result.stderr)
            self.assertFalse((Path(directory) / 'trace.jsonl').exists())

    def test_high_findings_and_scanner_failure_or_incomplete_reports_fail_closed(self):
        for mode in ('high', 'failure', 'empty', 'wrong_identity', 'missing_library', 'empty_coverage'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                fixture = self.fixture(directory, mode)
                result = self.run_scan(fixture)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.evidence(fixture[3]))
                self.assertFalse(list((fixture[3] / 'staging/studio-balance').iterdir()))
                self.assertEqual(len(list((fixture[3] / 'archives/studio-balance').glob('image-scans/abc1234/*/*.json'))), 3)

    def test_retagged_candidate_fails_and_never_records_verified_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory, 'retag')
            result = self.run_scan(fixture)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('changed after scan', result.stderr)
            self.assertFalse(self.evidence(fixture[3]))
            self.assertFalse(list((fixture[3] / 'staging/studio-balance').iterdir()))

    def test_symlinked_cache_and_bad_revision_refuse_and_keep_foreign_data(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory)
            foreign = Path(directory) / 'foreign'
            foreign.mkdir()
            (foreign / 'keep').write_text('foreign application')
            (fixture[3] / 'cache/studio-balance/trivy').symlink_to(foreign)
            result = self.run_scan(fixture)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((foreign / 'keep').read_text(), 'foreign application')
            self.assertFalse(list((fixture[3] / 'staging/studio-balance').iterdir()))
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory)
            result = self.run_scan(fixture, '../../another-app')
            self.assertEqual(result.returncode, 2)
            self.assertFalse((Path(directory) / 'trace.jsonl').exists())


class ScanCacheTests(unittest.TestCase):
    def test_only_own_idle_cache_resets_at_age_or_size_boundary(self):
        for age, size, reset in ((13 * 86400, 10, False), (14 * 86400, 10, True), (1, 2000, True)):
            with self.subTest(age=age, size=size), tempfile.TemporaryDirectory() as directory:
                cache = Path(directory) / 'trivy'
                cache.mkdir(mode=0o700)
                scan_cache.maintain(cache, now=100)
                (cache / 'analysis').mkdir()
                (cache / 'analysis/data').write_bytes(b'x' * size)
                foreign = Path(directory) / 'foreign'
                foreign.write_text('keep')
                self.assertEqual(scan_cache.maintain(cache, now=100 + age, size_limit=1000), reset)
                self.assertEqual(foreign.read_text(), 'keep')
                self.assertEqual((cache / 'analysis/data').exists(), not reset)

    def test_symlinks_and_unmanaged_contents_are_preserved_and_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / 'trivy'
            cache.mkdir(mode=0o700)
            foreign = Path(directory) / 'foreign'
            foreign.write_text('keep')
            (cache / 'data').write_text('unmanaged')
            with self.assertRaises(RuntimeError): scan_cache.maintain(cache, now=100)
            self.assertEqual((cache / 'data').read_text(), 'unmanaged')
            (cache / 'data').unlink()
            scan_cache.maintain(cache, now=100)
            (cache / 'external').symlink_to(foreign)
            with self.assertRaises(RuntimeError): scan_cache.maintain(cache, now=100 + 14 * 86400)
            self.assertEqual(foreign.read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()

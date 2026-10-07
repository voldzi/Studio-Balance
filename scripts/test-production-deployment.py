#!/usr/bin/env python3
import copy
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


verify = module('verify', 'verify-production-revision.py')
publish = module('publish', 'publish-production-tools.py')


class RevisionTests(unittest.TestCase):
    def fixture(self):
        identities = {service: f'sha256:{service}' for service in verify.SERVICES}
        containers = [{'Name': f'/studio-balance-production-{service}-1', 'Config': {'Image': f'studiobalance/{service}:abc1234', 'Env': ['APP_VERSION=abc1234']}, 'Image': identities[service], 'State': {'Running': True, 'Restarting': False, 'Health': {'Status': 'healthy'}}} for service in verify.SERVICES]
        return containers, identities

    def test_all_images_versions_and_health_are_required(self):
        containers, identities = self.fixture()
        self.assertTrue(verify.revision_matches(containers, identities, 'abc1234'))
        for service in range(3):
            for section, key, value in [('Config', 'Image', 'studiobalance/web:def5678'), ('Config', 'Env', ['APP_VERSION=def5678']), ('State', 'Health', {'Status': 'unhealthy'}), ('State', 'Restarting', True)]:
                changed = copy.deepcopy(containers)
                changed[service][section][key] = value
                self.assertFalse(verify.revision_matches(changed, identities, 'abc1234'))
            changed = copy.deepcopy(containers)
            changed[service]['Image'] = 'sha256:unexpected'
            self.assertFalse(verify.revision_matches(changed, identities, 'abc1234'))

    def test_first_generation_must_match_version_and_hold_schedule_lock(self):
        event = {'service': 'studio-balance-worker', 'version': 'abc1234', 'level': 'info', 'message': 'weekly_schedule_generated created=1 skipped=0 locked=true'}
        self.assertTrue(verify.worker_started_successfully(json.dumps(event), 'abc1234'))
        self.assertFalse(verify.worker_started_successfully(json.dumps(event), 'def5678'))
        event['message'] = 'weekly_schedule_generated created=0 skipped=0 locked=false'
        self.assertFalse(verify.worker_started_successfully(json.dumps(event), 'abc1234'))
        self.assertFalse(verify.worker_started_successfully('partial', 'abc1234'))

    def test_restart_during_verification_invalidates_first_generation_evidence(self):
        containers, _ = self.fixture()
        for item in containers: item['State']['StartedAt'] = '2026-10-07T12:00:00Z'
        self.assertTrue(verify.same_startup(containers, copy.deepcopy(containers)))
        changed = copy.deepcopy(containers)
        changed[2]['State']['StartedAt'] = '2026-10-07T12:00:01Z'
        self.assertFalse(verify.same_startup(containers, changed))


class AutomaticRollbackTests(unittest.TestCase):
    def fixture(self, directory):
        runtime = directory / 'runtime'
        candidate = directory / 'candidate'
        previous = runtime / 'releases/0d016c0'
        previous.mkdir(parents=True)
        (candidate / 'infra/scripts').mkdir(parents=True)
        (previous / 'docker-compose.production.yml').write_text('''name: studio-balance-production
services:
  worker:
    image: studiobalance/worker:${APP_VERSION}
    healthcheck:
      test: [CMD, node, -e, "process.kill(1, 0)"]
''')
        (candidate / 'docker-compose.production.yml').write_text('''name: studio-balance-production
services:
  worker:
    image: studiobalance/worker:${APP_VERSION}
    healthcheck:
      test: [CMD, node, dist/healthcheck.js]
''')
        repository = Path(__file__).resolve().parents[1]
        rollback = (repository / 'infra/scripts/rollback-production.sh').read_text()
        (candidate / 'infra/scripts/rollback-production.sh').write_text(rollback.replace('/srv/studio-balance', str(runtime)))
        (runtime / '.env.production').write_text('APP_ENV=production\n')
        (runtime / '.env.production').chmod(0o600)
        (runtime / 'storage-compose.yml').write_text('services: {}\n')
        (runtime / 'check-production-storage.sh').write_text('exit 0\n')
        (runtime / 'production-operation-lock.sh').write_text((repository / 'scripts/production-operation-lock.sh').read_text())
        (runtime / 'verify-production-revision.py').write_text('import sys\nassert sys.argv[1] == "0d016c0"\n')
        tools = directory / 'bin'
        tools.mkdir()
        def tool(name, body):
            file = tools / name
            file.write_text(body)
            file.chmod(0o700)
        tool('stat', '#!' + sys.executable + '\nimport pathlib,sys\nassert sys.argv[1:3] == ["-c", "%a"]\nprint(oct(pathlib.Path(sys.argv[3]).stat().st_mode & 0o777)[2:])\n')
        tool('flock', '#!/bin/sh\nexit 0\n')
        trace = directory / 'docker.jsonl'
        tool('docker', '#!' + sys.executable + '''
import json,os,pathlib,sys
args=sys.argv[1:]
with open(os.environ['ROLLBACK_TEST_TRACE'],'a') as stream:
    stream.write(json.dumps({'args':args,'version':os.environ.get('APP_VERSION')})+'\\n')
if args[:2] == ['image','inspect']: sys.exit(0)
assert args[0] == 'compose'
configs=[args[index+1] for index,value in enumerate(args) if value == '-f']
assert configs == [os.environ['ROLLBACK_TEST_PREVIOUS_COMPOSE'], os.environ['ROLLBACK_TEST_OVERLAY']]
assert os.environ['APP_VERSION'] == '0d016c0'
assert 'dist/healthcheck.js' not in pathlib.Path(configs[0]).read_text()
if 'up' in args:
    assert '--no-build' in args
    assert '--remove-orphans' in args
else: assert args[-1] == 'ps'
''')
        deploy = (repository / 'infra/scripts/deploy-production.sh').read_text()
        # Execute the real failure branch and guarded rollback script. Only
        # absolute production filesystem paths are mapped to private fixtures;
        # fake Docker never connects to a daemon or changes real containers.
        body = deploy.split('rollback_previous() {', 1)[1].split('\n}\n', 1)[0]
        function = ('rollback_previous() {' + body + '\n}').replace('/srv/studio-balance', str(runtime))
        command = '\n'.join(['set -euo pipefail', 'root=' + shlex.quote(str(candidate)), 'env_file=' + shlex.quote(str(runtime / '.env.production')), 'version=abc1234', 'previous_version=0d016c0', function, 'rollback_previous'])
        environment = {**os.environ, 'PATH': str(tools) + os.pathsep + os.environ['PATH'], 'APP_VERSION': 'abc1234', 'ROLLBACK_TEST_TRACE': str(trace), 'ROLLBACK_TEST_PREVIOUS_COMPOSE': str(previous / 'docker-compose.production.yml'), 'ROLLBACK_TEST_OVERLAY': str(runtime / 'storage-compose.yml')}
        environment.pop('STUDIO_BALANCE_OPERATION_LOCK_FD', None)
        return command, environment, trace, previous

    def test_legacy_rollback_uses_its_own_compose_without_new_worker_healthcheck(self):
        with tempfile.TemporaryDirectory() as directory:
            command, environment, trace, _ = self.fixture(Path(directory))
            result = subprocess.run(['bash', '-c', command], env=environment, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = [json.loads(line) for line in trace.read_text().splitlines()]
            self.assertEqual(len([call for call in calls if 'up' in call['args']]), 1)
            self.assertIn('Previous production revision 0d016c0 was restored', result.stderr)

    def test_missing_immutable_source_refuses_rollback_before_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            command, environment, trace, previous = self.fixture(Path(directory))
            (previous / 'docker-compose.production.yml').unlink()
            result = subprocess.run(['bash', '-c', command], env=environment, capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('immutable release 0d016c0 is unavailable', result.stderr)
            self.assertFalse(trace.exists())


class PublicationTests(unittest.TestCase):
    def candidate(self, directory):
        candidate = directory / 'candidate'
        (candidate / 'scripts').mkdir(parents=True)
        (candidate / 'infra').mkdir()
        for name in publish.TOOLS:
            (candidate / 'scripts' / name).write_bytes(b'complete selected candidate')
        (candidate / 'infra/docker-compose.storage.yml').write_bytes(b'overlay')
        root = directory / 'runtime'
        root.mkdir()
        return candidate, root

    def test_publish_keeps_old_open_reader_complete_and_sets_private_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate, root = self.candidate(Path(directory))
            target = root / publish.TOOLS[0]
            target.write_bytes(b'previous complete tool')
            with target.open('rb') as previous_reader:
                publish.publish_tools(candidate, root)
                self.assertEqual(previous_reader.read(), b'previous complete tool')
            self.assertEqual(target.read_bytes(), b'complete selected candidate')
            self.assertEqual(target.stat().st_mode & 0o777, 0o700)
            self.assertEqual((root / 'storage-compose.yml').stat().st_mode & 0o777, 0o600)
            self.assertFalse(list(root.glob('.tools-pending-*')))

    def test_incomplete_or_symlinked_candidate_cannot_change_live_tools(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate, root = self.candidate(Path(directory))
            target = root / publish.TOOLS[0]
            target.write_bytes(b'previous complete tool')
            source = candidate / 'scripts' / publish.TOOLS[-1]
            source.unlink()
            with self.assertRaises(RuntimeError): publish.publish_tools(candidate, root)
            source.symlink_to(candidate / 'scripts' / publish.TOOLS[0])
            with self.assertRaises(RuntimeError): publish.publish_tools(candidate, root)
            self.assertEqual(target.read_bytes(), b'previous complete tool')

    def test_lock_requires_expected_inode_and_excludes_a_concurrent_operation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.operation').touch()
            (root / '.different').touch()
            with (root / '.different').open('a') as other:
                with self.assertRaises(RuntimeError): publish.require_lock(root, '.operation', other.fileno())
            holder = subprocess.Popen(['python3', '-c', "import fcntl,sys; f=open(sys.argv[1],'a'); fcntl.flock(f,fcntl.LOCK_EX); print('locked',flush=True); sys.stdin.read()", str(root / '.operation')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(holder.stdout.readline().strip(), 'locked')
                with (root / '.operation').open('a') as contender:
                    with self.assertRaises(BlockingIOError): publish.require_lock(root, '.operation', contender.fileno())
            finally:
                holder.communicate('', timeout=5)
            with (root / '.operation').open('a') as inherited:
                publish.require_lock(root, '.operation', inherited.fileno())


if __name__ == '__main__':
    unittest.main()

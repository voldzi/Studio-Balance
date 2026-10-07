#!/usr/bin/env python3
"""Narrow, fail-closed update of the existing Studio Balance Nginx site.

Default execution only validates and prints hashes. No certificates, other
sites, analytics secrets or authentication settings are changed.
"""

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
from urllib import request


AVAILABLE = Path('/etc/nginx/sites-available/studio-balance.cz.conf')
ENABLED = Path('/etc/nginx/sites-enabled/studio-balance.cz.conf')
ANALYTICS = Path('/etc/nginx/vcode-analytics/studio-balance.cz.conf')
BACKUPS = Path('/var/backups/studiobalance-nginx')
LOCK = Path('/run/lock/studiobalance-nginx-hardening.lock')
MAX_CONFIG = 256 * 1024


class HardeningError(RuntimeError):
    pass


@dataclass
class Token:
    value: str
    start: int
    end: int


@dataclass
class Clause:
    name: str
    args: list
    start: int
    end: int
    opening_end: int = 0
    children: list = None


def tokens(text):
    """Token positions let the patch preserve every unrelated original byte."""
    result = []
    index = 0
    while index < len(text):
        if text[index].isspace():
            index += 1
            continue
        if text[index] == '#':
            end = text.find('\n', index)
            index = len(text) if end < 0 else end + 1
            continue
        start = index
        if text[index] in '{};':
            index += 1
        else:
            quoted = text[index] if text[index] in '\"\'' else None
            if quoted:
                index += 1
            while index < len(text):
                char = text[index]
                if char == '\\':
                    index += 2
                    continue
                if quoted:
                    index += 1
                    if char == quoted:
                        break
                elif char.isspace() or char in '{};#':
                    break
                else:
                    index += 1
            else:
                if quoted:
                    raise HardeningError('Unterminated Nginx string.')
            if index > len(text):
                raise HardeningError('Unterminated Nginx escape.')
        value = text[start:index]
        if value[:1] in ('\"', "'"):
            value = value[1:-1]
        result.append(Token(value, start, index))
    return result


def clauses(text):
    stream = tokens(text)

    def parse(index, nested=False):
        result = []
        while index < len(stream):
            if stream[index].value == '}':
                if not nested:
                    raise HardeningError('Unexpected Nginx closing brace.')
                return result, index + 1, stream[index].end
            begin = index
            while index < len(stream) and stream[index].value not in (';', '{', '}'):
                index += 1
            if index == len(stream) or index == begin or stream[index].value == '}':
                raise HardeningError('Incomplete Nginx directive.')
            words = stream[begin:index]
            delimiter = stream[index]
            if delimiter.value == ';':
                result.append(Clause(words[0].value, [word.value for word in words[1:]], words[0].start, delimiter.end))
                index += 1
            else:
                children, index, end = parse(index + 1, True)
                result.append(Clause(words[0].value, [word.value for word in words[1:]], words[0].start, end, delimiter.end, children))
        if nested:
            raise HardeningError('Unclosed Nginx block.')
        return result, index, len(text)

    return parse(0)[0]


def select(items, name, args=None):
    return [item for item in items if item.name == name and (args is None or item.args == args)]


def one(items, description):
    if len(items) != 1:
        raise HardeningError(f'Expected exactly one {description}; found {len(items)}.')
    return items[0]


def line_after(text, clause, opening=False):
    start = clause.opening_end if opening else clause.end
    end = text.find('\n', start)
    if end < 0:
        raise HardeningError('The selected Nginx anchor requires its own line.')
    tail = text[start:end].strip()
    if tail and not tail.startswith('#'):
        raise HardeningError('Ambiguous Nginx insertion anchor.')
    line_start = text.rfind('\n', 0, clause.start) + 1
    indentation = text[line_start:clause.start]
    if indentation.strip():
        raise HardeningError('The selected Nginx directive requires its own line.')
    return end + 1, indentation


def render(original):
    if not original or len(original) > MAX_CONFIG or b'\x00' in original:
        raise HardeningError('Nginx app configuration is empty, oversized or invalid.')
    try:
        text = original.decode('utf-8')
    except UnicodeDecodeError as error:
        raise HardeningError('Nginx app configuration must be UTF-8.') from error
    newline = '\r\n' if '\r\n' in text else '\n'
    if '\r' in text.replace('\r\n', '') or (newline == '\r\n' and '\n' in text.replace('\r\n', '')):
        raise HardeningError('Mixed Nginx line endings are not supported.')
    servers = [server for server in select(clauses(text), 'server') if select(server.children or [], 'server_name', ['studio-balance.cz'])]
    server = one(servers, 'canonical Studio Balance server')
    children = server.children
    one(select(children, 'include', [str(ANALYTICS)]), 'approved analytics include')
    if not any(item.name == 'listen' and item.args[:1] == ['443'] and 'ssl' in item.args for item in children):
        raise HardeningError('The canonical site is not the existing HTTPS virtual host.')
    api = one(select(children, 'location', ['/api/']), 'application API proxy')
    web = one(select(children, 'location', ['/']), 'application web proxy')
    for location, upstream in [(api, 'http://docker.home.cz:4281'), (web, 'http://docker.home.cz:3281')]:
        one(select(location.children, 'proxy_pass', [upstream]), 'expected production upstream')
        forwarded = [item for item in select(location.children, 'proxy_set_header') if item.args[:1] == ['X-Forwarded-For']]
        if one(forwarded, 'trusted forwarded IP header').args != ['X-Forwarded-For', '$remote_addr']:
            raise HardeningError('Refusing to change an unfamiliar forwarded IP trust boundary.')

    changes = []
    internal = [item for item in select(children, 'location') if any('/api/internal' in argument for argument in item.args)]
    if internal:
        if len(internal) != 2 or {tuple(item.args) for item in internal} != {('=', '/api/internal'), ('^~', '/api/internal/')}:
            raise HardeningError('Partial or conflicting internal API protection.')
        for item in internal:
            if len(item.children or []) != 1 or not select(item.children, 'return', ['404']):
                raise HardeningError('Unfamiliar internal API protection.')
    else:
        ready = one(select(children, 'location', ['=', '/ready']), 'existing readiness denial')
        if len(ready.children or []) != 1 or not select(ready.children, 'return', ['404']):
            raise HardeningError('Unfamiliar readiness denial.')
        position, indentation = line_after(text, ready)
        patch = newline.join([indentation + 'location = /api/internal { return 404; }', indentation + 'location ^~ /api/internal/ { return 404; }', ''])
        changes.append((position, patch))

    if select(children, 'location', ['=', '/api/v1/sessions']):
        raise HardeningError('Conflicting top-level session API location.')
    compression = select(api.children, 'gzip')
    sessions = select(api.children, 'location', ['=', '/api/v1/sessions'])
    # A partial prior edit is never silently repaired or overwritten.
    if compression or sessions:
        if len(compression) != 1 or compression[0].args != ['off'] or len(sessions) != 1:
            raise HardeningError('Partial or conflicting API compression configuration.')
        expected = [('gzip', ['on']), ('gzip_types', ['application/json']), ('gzip_min_length', ['1024']), ('gzip_vary', ['on'])]
        session_children = sessions[0].children or []
        if any(len(select(session_children, name, arguments)) != 1 for name, arguments in expected):
            raise HardeningError('Unfamiliar session compression configuration.')
        if len(session_children) == len(expected):
            # Nginx inherits proxy settings, but the child location needs its
            # own proxy_pass content handler. Upgrade only the byte-preserved,
            # known four-directive prior revision; reject any foreign clauses.
            position, indentation = line_after(text, sessions[0], opening=True)
            changes.append((position, indentation + '    proxy_pass http://docker.home.cz:4281;' + newline + indentation + '    gzip_proxied any;' + newline))
        elif len(session_children) == len(expected) + 1 and len(select(session_children, 'proxy_pass', ['http://docker.home.cz:4281'])) == 1:
            # A real incoming Via header selects the inherited gzip_proxied
            # policy; its default is off. Permit proxy compression only for
            # this public JSON endpoint, never the private parent API scope.
            handler = select(session_children, 'proxy_pass', ['http://docker.home.cz:4281'])[0]
            position, indentation = line_after(text, handler)
            changes.append((position, indentation + 'gzip_proxied any;' + newline))
        elif len(session_children) != len(expected) + 2 or len(select(session_children, 'proxy_pass', ['http://docker.home.cz:4281'])) != 1 or len(select(session_children, 'gzip_proxied', ['any'])) != 1:
            raise HardeningError('Unfamiliar session proxy/compression configuration.')
    else:
        if any(item.name.startswith('gzip') for item in api.children):
            raise HardeningError('Unfamiliar API compression configuration.')
        position, indentation = line_after(text, api, opening=True)
        child = indentation + '    '
        grandchild = child + '    '
        patch = newline.join([child + 'gzip off;', child + 'location = /api/v1/sessions {', grandchild + 'proxy_pass http://docker.home.cz:4281;', grandchild + 'gzip_proxied any;', grandchild + 'gzip on;', grandchild + 'gzip_types application/json;', grandchild + 'gzip_min_length 1024;', grandchild + 'gzip_vary on;', child + '}', ''])
        changes.append((position, patch))
    for position, patch in sorted(changes, reverse=True):
        text = text[:position] + patch + text[position:]
    return text.encode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


@dataclass
class Snapshot:
    path: Path
    data: bytes
    mode: int
    uid: int
    gid: int
    link: bool
    attributes: dict


def snapshot(path):
    info = path.lstat()
    link = stat.S_ISLNK(info.st_mode)
    if link:
        data = os.fsencode(os.readlink(path))
        attributes = {}
    elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, 'rb') as stream:
            before = os.fstat(stream.fileno())
            if (before.st_dev, before.st_ino) != (info.st_dev, info.st_ino):
                raise HardeningError('Configuration changed while being opened.')
            data = stream.read(MAX_CONFIG + 1)
            after = os.fstat(stream.fileno())
        if len(data) > MAX_CONFIG or (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
            raise HardeningError('Configuration changed or exceeded the size limit during reading.')
        # The production CLI requires Linux xattr support. Pure file helpers
        # also run in macOS unit fixtures, where Python may omit these APIs.
        attributes = {name: os.getxattr(path, name) for name in os.listxattr(path)} if hasattr(os, 'listxattr') else {}
    else:
        raise HardeningError('Only regular, non-hardlinked configuration files are supported.')
    return Snapshot(path, data, stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid, link, attributes)


def unchanged(previous):
    current = snapshot(previous.path)
    if (current.data, current.mode, current.uid, current.gid, current.link, current.attributes) != (previous.data, previous.mode, previous.uid, previous.gid, previous.link, previous.attributes):
        raise HardeningError(f'Concurrent modification detected: {previous.path}.')


def atomic_write(previous, data):
    if previous.link:
        raise HardeningError('Refusing to replace an enabled-site symlink.')
    descriptor, temporary = tempfile.mkstemp(prefix='.' + previous.path.name + '.hardening-', dir=previous.path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            os.fchown(stream.fileno(), previous.uid, previous.gid)
            os.fchmod(stream.fileno(), previous.mode)
            stream.write(data)
            stream.flush()
            for name, value in previous.attributes.items():
                os.setxattr(stream.fileno(), name, value)
            os.fsync(stream.fileno())
        unchanged(previous)
        os.replace(temporary, previous.path)
        directory = os.open(previous.path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def run_command(command):
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    if result.returncode:
        # Nginx diagnostics may name other sites; never dump their configuration.
        raise HardeningError(f'{command[0]} validation/action failed (exit {result.returncode}).')


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_upstreams(version):
    for host in ('studio-balance.cz', 'www.studio-balance.cz', 'login.studio-balance.cz', 'docker.home.cz'):
        socket.getaddrinfo(host, 80, socket.AF_INET, socket.SOCK_STREAM)
    opener = request.build_opener(request.ProxyHandler({}), NoRedirect())
    for url in ('http://docker.home.cz:3281/', 'http://docker.home.cz:8081/realms/studio-balance'):
        with opener.open(request.Request(url, method='HEAD'), timeout=10) as response:
            if response.status != 200:
                raise HardeningError('The expected application/identity upstream did not return HTTP 200.')
    with opener.open(request.Request('http://docker.home.cz:4281/ready', headers={'Accept': 'application/json'}), timeout=10) as response:
        data = response.read(8193)
        if response.status != 200 or len(data) > 8192:
            raise HardeningError('The API readiness response is invalid.')
    try:
        ready = json.loads(data)
    except (ValueError, UnicodeError) as error:
        raise HardeningError('The API readiness response is not valid JSON.') from error
    if not isinstance(ready, dict) or ready.get('status') != 'ok' or ready.get('version') != version:
        raise HardeningError('API readiness does not match the exact expected version.')


def plan(available=AVAILABLE, enabled=ENABLED, analytics=ANALYTICS):
    originals = [snapshot(available), snapshot(enabled)]
    if originals[0].link or (originals[1].link and enabled.resolve(strict=True) != available.resolve(strict=True)):
        raise HardeningError('The enabled site must be a regular file or link to the dedicated available site.')
    approved = snapshot(analytics)
    if approved.link or not approved.data:
        raise HardeningError('The existing private analytics include must be a nonempty regular file.')
    updates = [(original, render(original.data)) for original in originals if not original.link]
    return originals, approved, updates


def backup(originals, approved, version, directory):
    directory.mkdir(mode=0o700, parents=False)
    records = []
    for index, original in enumerate(originals):
        unchanged(original)
        target = directory / f'{index}-{original.path.parent.name}-{original.path.name}'
        shutil.copy2(original.path, target, follow_symlinks=False)
        os.chown(target, original.uid, original.gid, follow_symlinks=False)
        copied = snapshot(target)
        if (copied.data, copied.mode, copied.uid, copied.gid, copied.link, copied.attributes) != (original.data, original.mode, original.uid, original.gid, original.link, original.attributes):
            raise HardeningError('The configuration backup failed integrity/metadata verification.')
        if not copied.link:
            with target.open('rb') as stream:
                os.fsync(stream.fileno())
        records.append({'path': str(original.path), 'backup': target.name, 'sha256': digest(original.data), 'symlink': original.link})
    manifest = directory / 'manifest.json'
    with manifest.open('x') as stream:
        os.fchmod(stream.fileno(), 0o600)
        json.dump({'version': version, 'configs': records, 'analyticsSha256': digest(approved.data)}, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def apply_updates(originals, approved, updates, version, backup_directory, check=check_upstreams, command=run_command):
    # No file or service change occurs until every dependency, config and copy
    # passes. Rechecking CAS immediately before every replace protects both
    # regular enabled files and the normal enabled-site symlink arrangement.
    check(version)
    command(['nginx', '-t'])
    for original in originals + [approved]:
        unchanged(original)
    backup(originals, approved, version, backup_directory)
    changed = [(original, data) for original, data in updates if data != original.data]
    written = []
    try:
        for original, data in changed:
            for watched in originals + [approved]:
                current_data = next((candidate for previous, candidate in written if previous.path == watched.path), watched.data)
                unchanged(Snapshot(watched.path, current_data, watched.mode, watched.uid, watched.gid, watched.link, watched.attributes))
            written.append((original, data))
            atomic_write(original, data)
        for original, data in written:
            unchanged(Snapshot(original.path, data, original.mode, original.uid, original.gid, False, original.attributes))
        unchanged(approved)
        if written:
            command(['nginx', '-t'])
            command(['systemctl', 'reload', 'nginx'])
        check(version)
        for original, data in updates:
            unchanged(Snapshot(original.path, data, original.mode, original.uid, original.gid, False, original.attributes))
        for original in originals:
            if original.link:
                unchanged(original)
        unchanged(approved)
    except BaseException as error:
        rollback_errors = []
        for original, data in reversed(written):
            try:
                # Failure may occur before replace, or after replace while
                # syncing its directory. Recover both without overlooking a
                # completed rename and without overwriting another writer.
                if snapshot(original.path) == original:
                    continue
                current = Snapshot(original.path, data, original.mode, original.uid, original.gid, False, original.attributes)
                unchanged(current)
                atomic_write(current, original.data)
            except BaseException as failure:
                rollback_errors.append(str(failure))
        for original in originals + [approved]:
            try:
                unchanged(original)
            except BaseException as failure:
                rollback_errors.append(str(failure))
        if written and not rollback_errors:
            try:
                command(['nginx', '-t'])
                command(['systemctl', 'reload', 'nginx'])
            except BaseException as failure:
                rollback_errors.append(str(failure))
        if rollback_errors:
            raise HardeningError(f'Update failed; rollback requires manual review. Backup: {backup_directory}.') from error
        raise HardeningError(f'Update failed; original app configuration restored. Backup: {backup_directory}.') from error
    return len(written)


@contextmanager
def operation_lock(path):
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_nlink != 1 or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise HardeningError('Unsafe DMZ operation lock.')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(descriptor)


def interrupted(signum, frame):
    raise HardeningError('DMZ update interrupted; restoring the owned configuration changes.')


def require_host():
    if sys.platform != 'linux' or not all(hasattr(os, name) for name in ('listxattr', 'getxattr', 'setxattr')):
        raise HardeningError('Run the production CLI on the Linux DMZ host with extended-attribute support.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-version', required=True, help='Exact version currently served by the API; 7-40 lowercase Git SHA characters.')
    parser.add_argument('--apply', action='store_true', help='Apply the reviewed app-only configuration change. Default: read-only validation.')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{7,40}', args.expected_version):
        parser.error('The expected version must be a lowercase Git SHA.')
    if args.apply and os.geteuid() != 0:
        parser.error('Applying the change requires root.')
    require_host()
    originals, approved, updates = plan()
    summary = {'mode': 'apply' if args.apply else 'dry-run', 'version': args.expected_version, 'analyticsSha256': digest(approved.data), 'files': [{'path': str(original.path), 'beforeSha256': digest(original.data), 'afterSha256': digest(data), 'change': data != original.data} for original, data in updates]}
    if not args.apply:
        check_upstreams(args.expected_version)
        run_command(['nginx', '-t'])
        for original in originals + [approved]:
            unchanged(original)
        print(json.dumps(summary, indent=2))
        return
    with operation_lock(LOCK):
        # The snapshot is reloaded under the same application-specific lock.
        originals, approved, updates = plan()
        summary['analyticsSha256'] = digest(approved.data)
        summary['files'] = [{'path': str(original.path), 'beforeSha256': digest(original.data), 'afterSha256': digest(data), 'change': data != original.data} for original, data in updates]
        for signum in (signal.SIGTERM, signal.SIGHUP):
            signal.signal(signum, interrupted)
        if not any(original.data != data for original, data in updates):
            check_upstreams(args.expected_version)
            run_command(['nginx', '-t'])
            for original in originals + [approved]:
                unchanged(original)
            summary['changedFiles'] = 0
        else:
            BACKUPS.mkdir(mode=0o700, exist_ok=True)
            if BACKUPS.is_symlink() or BACKUPS.stat().st_uid != 0 or stat.S_IMODE(BACKUPS.stat().st_mode) != 0o700:
                raise HardeningError('Unsafe DMZ app backup directory.')
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
            directory = BACKUPS / (stamp + '-' + args.expected_version[:12])
            summary['changedFiles'] = apply_updates(originals, approved, updates, args.expected_version, directory)
            summary['backup'] = str(directory)
        print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (HardeningError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'Studio Balance Nginx hardening refused/failed: {error}', file=sys.stderr)
        sys.exit(1)

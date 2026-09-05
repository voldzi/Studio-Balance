#!/usr/bin/env python3
"""Install only the Studio Balance backup entries in the operator's crontab."""
import subprocess
from pathlib import Path

ROOT = Path('/home/voldzi/deployments/studio-balance')
(ROOT / 'backup-media.sh').chmod(0o700)
(ROOT / '.env.media-backup').chmod(0o600)
(ROOT / 'media-backups').mkdir(mode=0o700, exist_ok=True)
(ROOT / 'media-backups').chmod(0o700)
(ROOT / 'media-backup.log').touch(mode=0o600, exist_ok=True)
(ROOT / 'media-backup.log').chmod(0o600)
begin = '# BEGIN STUDIO BALANCE MEDIA BACKUP'
end = '# END STUDIO BALANCE MEDIA BACKUP'
result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
if result.returncode != 0 and not (result.returncode == 1 and 'no crontab' in result.stderr.lower()):
    raise RuntimeError('Cannot read operator crontab')
old = result.stdout
if old.count(begin) != old.count(end) or old.count(begin) > 1:
    raise RuntimeError('Ambiguous managed cron block; preserve existing crontab')
if begin in old:
    before, rest = old.split(begin, 1)
    _, after = rest.split(end, 1)
    old = before.rstrip() + '\n' + after.lstrip('\n')
backup = ROOT / '.crontab.before-media'
if not backup.exists():
    with open(backup, 'x') as stream:
        backup.chmod(0o600)
        stream.write(result.stdout)
block = f'''{begin}
# Daily backup at 03:40 in the server timezone; hourly age/checksum verification.
40 3 * * * {ROOT}/backup-media.sh >> {ROOT}/media-backup.log 2>&1
15 * * * * {ROOT}/backup-media.sh --check >> {ROOT}/media-backup.log 2>&1
{end}
'''
subprocess.run(['crontab', '-'], input=old.rstrip()+'\n'+block, text=True, check=True)
print('Installed dedicated daily backup and hourly verification; other cron entries preserved')

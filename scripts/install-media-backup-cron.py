#!/usr/bin/env python3
"""Install only the Studio Balance backup entries in the operator's crontab."""
import subprocess
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--enable-retention', action='store_true')
args = parser.parse_args()
retention_flag = ' --apply' if args.enable_retention else ''
ROOT = Path('/srv/studio-balance')
subprocess.run(['bash', str(ROOT / 'check-production-storage.sh')], check=True)
(ROOT / 'backup-media.sh').chmod(0o700)
(ROOT / '.env.media-backup').chmod(0o600)
(Path('/srv/x5-production/backups/studio-balance/media')).mkdir(mode=0o700, exist_ok=True)
(Path('/srv/x5-production/backups/studio-balance/media')).chmod(0o700)
(Path('/srv/x5-production/cache/studio-balance/media-backup.log')).touch(mode=0o600, exist_ok=True)
(Path('/srv/x5-production/cache/studio-balance/media-backup.log')).chmod(0o600)
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
40 3 * * * {ROOT}/backup-media.sh
15 * * * * {ROOT}/backup-media.sh --check
20 5 * * * /usr/bin/python3 {ROOT}/manage-production-storage.py{retention_flag}
{end}
'''
subprocess.run(['crontab', '-'], input=old.rstrip()+'\n'+block, text=True, check=True)
print('Installed dedicated daily backup and hourly verification; other cron entries preserved')

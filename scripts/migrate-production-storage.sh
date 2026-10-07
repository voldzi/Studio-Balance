#!/usr/bin/env bash
# Operator-reviewed relocation; run on docker.home.cz as voldzi after directory provisioning.
set -euo pipefail
umask 077
old=/home/voldzi/deployments/studio-balance
new=/srv/studio-balance
x5=/srv/x5-production
tools="$(cd "$(dirname "$0")" && pwd)"
bash "$tools/check-production-storage.sh"
[[ -d "$new" && ! -L "$new" && -w "$new" && -d "$old" && ! -L "$old" ]] || exit 1
exec 8>"$old/.production-operation.lock"
flock -n 8 || exit 1
exec 9>"$old/.media-backup.lock"
flock -n 9 || exit 1
# Containers have no host-data mounts. Media cron uses these locks; release
# sources are immutable. No database or queue is moved.
rsync -aH --exclude releases --exclude artifacts --exclude media-backups --exclude media-backup.log "$old/" "$new/"
mkdir -p "$new/releases" "$x5/archives/studio-balance/releases" "$x5/archives/studio-balance/artifacts" "$x5/backups/studio-balance/media"
rsync -aH "$old/releases/" "$x5/archives/studio-balance/releases/"
rsync -aH "$old/artifacts/" "$x5/archives/studio-balance/artifacts/"
rsync -aH "$old/media-backups/" "$x5/backups/studio-balance/media/"
rsync -aH "$old/media-backup.log" "$x5/cache/studio-balance/"
for entry in releases artifacts media-backups; do
  case "$entry" in
    releases|artifacts) dest="$x5/archives/studio-balance/$entry/" ;;
    media-backups) dest="$x5/backups/studio-balance/media/" ;;
  esac
  [[ -z "$(rsync -aHnci --delete "$old/$entry/" "$dest")" ]] || { echo "Integrity comparison failed: $entry" >&2; exit 1; }
done
comparison=$(rsync -aHnci --exclude releases --exclude artifacts --exclude media-backups --exclude media-backup.log --exclude .media-backup.lock --exclude .production-operation.lock "$old/" "$new/" | sed '/^\.d\.\.t...... \.\/$/d')
[[ -z "$comparison" ]] || { echo 'Configuration copy differs' >&2; exit 1; }
chmod 0700 "$new"
for version in 0d016c0 817f7ff 0f51679; do
  for service in api web worker; do docker image inspect "studiobalance/$service:$version" >/dev/null; done
  mv "$x5/archives/studio-balance/releases/$version" "$new/releases/"
done
printf '%s\n' '{"versions":["0d016c0","817f7ff","0f51679"]}' > "$new/verified-releases.json"
# Preserve old secret configuration snapshots on X5, without retention deletion.
mkdir -p "$x5/archives/studio-balance/config-history"
for file in "$new"/.env.production.* "$new"/.env.preview "$new"/.env.media-incoming "$new"/.crontab.before-media; do
  [[ ! -f "$file" ]] || mv "$file" "$x5/archives/studio-balance/config-history/"
done
for file in check-production-storage.sh manage-production-storage.py record-verified-release.py backup-media.sh media-backup.mjs install-media-backup-cron.py; do
  install -m 0700 "$tools/$file" "$new/$file"
done
install -m 0600 "$tools/../infra/docker-compose.storage.yml" "$new/storage-compose.yml"
python3 "$new/install-media-backup-cron.py"
echo 'Copied and verified; originals retained until backup, restore and application acceptance pass.'

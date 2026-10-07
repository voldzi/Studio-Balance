#!/usr/bin/env bash
set -euo pipefail
task_root=/srv/studio-balance
bash "$task_root/check-production-storage.sh"
exec 9>"$task_root/.media-backup.lock"
flock -n 9 || exit 0
log=/srv/x5-production/cache/studio-balance/media-backup.log
if [[ -f "$log" ]] && (( $(stat -c %s "$log") > 10 * 1024 * 1024 )); then
  mv -f "$log" "$log.1"
fi
exec >>/srv/x5-production/cache/studio-balance/media-backup.log 2>&1
image="$(docker inspect --format '{{.Config.Image}}' studio-balance-production-api-1)"
[[ "$image" =~ ^studiobalance/api:[0-9a-f]{7,40}$ ]] || { echo 'Unexpected API image' >&2; exit 1; }
docker run --rm --network studio-balance-production_default --read-only --security-opt no-new-privileges:true \
  --user "$(id -u):$(id -g)" \
  --cap-drop ALL --memory 192m --cpus 0.25 \
  --env-file "$task_root/.env.media-backup" \
  --mount "type=bind,src=/srv/x5-production/backups/studio-balance/media,dst=/backup" \
  --mount "type=bind,src=$task_root/media-backup.mjs,dst=/app/apps/api/media-backup.mjs,readonly" \
  "$image" node /app/apps/api/media-backup.mjs "$@"

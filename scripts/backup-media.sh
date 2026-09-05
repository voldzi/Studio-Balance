#!/usr/bin/env bash
set -euo pipefail
task_root=/home/voldzi/deployments/studio-balance
exec 9>"$task_root/.media-backup.lock"
flock -n 9 || exit 0
image="$(docker inspect --format '{{.Config.Image}}' studio-balance-production-api-1)"
[[ "$image" =~ ^studiobalance/api:[0-9a-f]{7,40}$ ]] || { echo 'Unexpected API image' >&2; exit 1; }
docker run --rm --network studio-balance-production_default --read-only --security-opt no-new-privileges:true \
  --user "$(id -u):$(id -g)" \
  --cap-drop ALL --memory 192m --cpus 0.25 \
  --env-file "$task_root/.env.media-backup" \
  --mount "type=bind,src=$task_root/media-backups,dst=/backup" \
  --mount "type=bind,src=$task_root/media-backup.mjs,dst=/app/apps/api/media-backup.mjs,readonly" \
  "$image" node /app/apps/api/media-backup.mjs "$@"

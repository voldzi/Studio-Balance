#!/usr/bin/env bash
# Only this X5-staged, commit-selected entrypoint publishes live maintenance tools.
set -euo pipefail
umask 077
version="${1:-}"
stage="${2:-}"
root=/srv/studio-balance
[[ "$version" =~ ^[0-9a-f]{7,40}$ && "$stage" =~ ^/srv/x5-production/staging/studio-balance/\.deploy-[0-9a-f]{7,40}\.[a-zA-Z0-9]{8}$ ]] || exit 2
[[ "$stage" == "/srv/x5-production/staging/studio-balance/.deploy-$version."* && -d "$stage" && ! -L "$stage" ]] || exit 1
source_dir="$stage/source"
[[ -d "$source_dir" && ! -L "$source_dir" && -f "$source_dir/docker-compose.production.yml" ]] || exit 1
bash "$root/check-production-storage.sh"
bash "$source_dir/scripts/check-production-storage.sh"
[[ "$(stat -c %d "$stage")" == "$(stat -c %d /srv/x5-production)" ]] || exit 1
source "$source_dir/scripts/production-operation-lock.sh"
acquire_studio_operation_lock "$root/.production-operation.lock"
marker="$root/.deploying-$version"

# Publishing tools must exclude both deployment/retention and backup readers.
# An atomic rename means even a reader started before taking its lock sees one
# complete script. Release the media lock before the potentially long build.
exec 8>"$root/.media-backup.lock"
flock -n 8 || { echo 'Media operation is running; deployment deferred' >&2; exit 1; }
touch "$marker"
python3 "$source_dir/scripts/publish-production-tools.py" "$source_dir"
flock -u 8
exec 8>&-

release="$root/releases/$version"
if [[ -e "$release" ]]; then
  [[ -d "$release" && ! -L "$release" ]] || exit 1
  [[ -z "$(rsync -rlcni --delete "$source_dir/" "$release/")" ]] || { echo 'Existing immutable release differs; refusing overwrite' >&2; exit 1; }
else
  pending="$root/releases/.pending-$version-$$"
  mkdir -m 0700 "$pending"
  cp -a "$source_dir/." "$pending/"
  mv -- "$pending" "$release"
fi
STUDIO_BALANCE_PRODUCTION_ENV_FILE="$root/.env.production" bash "$release/infra/scripts/deploy-production.sh" "$version"
rm -f -- "$marker"
# This path is a validated unique staging directory owned by this operation.
rm -rf -- "$stage"

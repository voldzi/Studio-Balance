#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="${STUDIO_BALANCE_DOCKER_HOST:-docker.home.cz}"
version="${1:-$(git -C "$root" rev-parse HEAD)}"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 [git-sha]" >&2
  exit 2
fi

if ! git -C "$root" diff --quiet || ! git -C "$root" diff --cached --quiet; then
  echo "Deployment refused: commit or stash tracked local changes first." >&2
  exit 1
fi

bash "$root/scripts/check-analytics-release.sh" "$version"
bash "$root/scripts/check-public-analytics.sh"

remote_root="/srv/studio-balance"
release_dir="$remote_root/releases/$version"
artifact="/srv/x5-production/staging/studio-balance/$version.tar"
archive="$(mktemp -t studiobalance-production.XXXXXX.tar)"
trap 'rm -f "$archive"' EXIT

git -C "$root" archive --format=tar --output="$archive" "$version"
ssh "$remote_host" bash "$remote_root/check-production-storage.sh"
ssh "$remote_host" touch "$remote_root/.deploying-$version"
for tool in check-production-storage.sh manage-production-storage.py record-verified-release.py backup-media.sh media-backup.mjs install-media-backup-cron.py connect-media-runtime.sh connect-registration-runtime.sh activate-production-registration.sh provision-registration-control.py; do
  scp "$root/scripts/$tool" "$remote_host:$remote_root/$tool"
done
scp "$root/infra/docker-compose.storage.yml" "$remote_host:$remote_root/storage-compose.yml"
ssh "$remote_host" mkdir -p "$release_dir"
scp "$archive" "$remote_host:$artifact"
ssh "$remote_host" tar -xf "$artifact" -C "$release_dir"
ssh "$remote_host" \
  "STUDIO_BALANCE_PRODUCTION_ENV_FILE=$remote_root/.env.production" \
  "STUDIO_BALANCE_PREBUILT_IMAGES=${STUDIO_BALANCE_PREBUILT_IMAGES:-0}" \
  "$release_dir/infra/scripts/deploy-production.sh" "$version"

ssh "$remote_host" rm -f -- "$artifact" "$remote_root/.deploying-$version"
ssh "$remote_host" python3 "$remote_root/manage-production-storage.py" --apply

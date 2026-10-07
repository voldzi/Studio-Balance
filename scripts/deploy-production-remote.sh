#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="${STUDIO_BALANCE_DOCKER_HOST:-docker.home.cz}"
version="${1:-$(git -C "$root" rev-parse HEAD)}"
prebuilt="${STUDIO_BALANCE_PREBUILT_IMAGES:-0}"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 [git-sha]" >&2
  exit 2
fi
[[ "$prebuilt" == 0 || "$prebuilt" == 1 ]] || { echo 'Prebuilt image mode must be 0 or 1' >&2; exit 2; }

if ! git -C "$root" diff --quiet || ! git -C "$root" diff --cached --quiet; then
  echo "Deployment refused: commit or stash tracked local changes first." >&2
  exit 1
fi

bash "$root/scripts/check-analytics-release.sh" "$version"
bash "$root/scripts/check-public-analytics.sh"

remote_root="/srv/studio-balance"
archive="$(mktemp -t studiobalance-production.XXXXXX.tar)"
trap 'rm -f "$archive"' EXIT

git -C "$root" archive --format=tar --output="$archive" "$version"
# The entrypoint and every published tool come from the exact selected commit.
# Historical versions without this guarded entrypoint are rollback-only.
git -C "$root" cat-file -e "$version:scripts/deploy-production-entry.sh"
ssh "$remote_host" bash "$remote_root/check-production-storage.sh"
stage="$(ssh "$remote_host" bash -s -- "$version" <<'REMOTE'
set -euo pipefail
bash /srv/studio-balance/check-production-storage.sh
cd /srv/x5-production/staging/studio-balance
# Pin the verified filesystem while creating the unique working directory.
[[ "$(stat -c %d .)" == "$(stat -c %d /srv/x5-production)" && "$(stat -c %d .)" != "$(stat -c %d /srv)" ]] || exit 1
directory="$(mktemp -d ".deploy-$1.XXXXXXXX")"
printf '%s/%s\n' "$PWD" "$directory"
REMOTE
)"
[[ "$stage" =~ ^/srv/x5-production/staging/studio-balance/\.deploy-[0-9a-f]{7,40}\.[a-zA-Z0-9]{8}$ ]] || { echo 'Invalid remote staging path' >&2; exit 1; }
scp "$archive" "$remote_host:$stage/source.tar"
ssh "$remote_host" mkdir -m 0700 "$stage/source"
ssh "$remote_host" tar -xf "$stage/source.tar" -C "$stage/source"
ssh "$remote_host" \
  "STUDIO_BALANCE_PREBUILT_IMAGES=$prebuilt" \
  bash "$stage/source/scripts/deploy-production-entry.sh" "$version" "$stage"

# The entrypoint has released both locks; retention reacquires them itself.
ssh "$remote_host" python3 "$remote_root/manage-production-storage.py" --apply

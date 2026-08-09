#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="${STUDIO_BALANCE_DOCKER_HOST:-docker.home.cz}"
version="${1:-}"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <previous-git-sha>" >&2
  exit 2
fi

if ! git -C "$root" diff --quiet || ! git -C "$root" diff --cached --quiet; then
  echo "Rollback refused: commit or stash tracked local changes first." >&2
  exit 1
fi
if ! git -C "$root" ls-files --error-unmatch infra/scripts/rollback-production.sh >/dev/null 2>&1; then
  echo "Rollback refused: the production rollback tool is not tracked by Git." >&2
  exit 1
fi

remote_root="/home/voldzi/deployments/studio-balance"
release_dir="$remote_root/releases/$version"
remote_tool=""
remote_temporary=""

cleanup() {
  if [[ -n "$remote_temporary" || -n "$remote_tool" ]]; then
    ssh "$remote_host" rm -f -- "$remote_temporary" "$remote_tool" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

ssh "$remote_host" test -f "$release_dir/docker-compose.production.yml"
ssh "$remote_host" mkdir -p "$remote_root/tools"
remote_temporary="$(ssh "$remote_host" mktemp "$remote_root/tools/.rollback-production.XXXXXX")"
remote_tool="${remote_temporary}.ready"
scp "$root/infra/scripts/rollback-production.sh" "$remote_host:$remote_temporary"
ssh "$remote_host" chmod 0755 "$remote_temporary"
ssh "$remote_host" mv -- "$remote_temporary" "$remote_tool"
ssh "$remote_host" \
  "STUDIO_BALANCE_PRODUCTION_ENV_FILE=$remote_root/.env.production" \
  "STUDIO_BALANCE_RELEASE_ROOT=$release_dir" \
  "$remote_tool" "$version"

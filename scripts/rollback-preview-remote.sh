#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

remote_host="${STUDIO_BALANCE_DOCKER_HOST:-docker.home.cz}"
version="${1:-}"
remote_root="/home/voldzi/deployments/studio-balance"
release_dir="$remote_root/releases/$version"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <previous-git-sha>" >&2
  exit 2
fi

ssh "$remote_host" test -x "$release_dir/infra/scripts/activate-preview.sh"
ssh "$remote_host" \
  "STUDIO_BALANCE_PREVIEW_ENV_FILE=$remote_root/.env.preview" \
  "$release_dir/infra/scripts/activate-preview.sh" "$version"

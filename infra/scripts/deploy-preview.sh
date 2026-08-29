#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="${1:-}"
env_file="${STUDIO_BALANCE_PREVIEW_ENV_FILE:-$root/.env.preview}"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <git-sha>" >&2
  exit 2
fi

available_disk_kb="$(df --output=avail -k / | tail -n 1 | tr -d ' ')"
available_memory_kb="$(awk '/MemAvailable:/ { print $2 }' /proc/meminfo)"

if (( available_disk_kb < 20 * 1024 * 1024 )); then
  echo "Deployment refused: less than 20 GiB is available on /." >&2
  exit 1
fi

if (( available_memory_kb < 2 * 1024 * 1024 )); then
  echo "Deployment refused: less than 2 GiB of memory is available." >&2
  exit 1
fi

STUDIO_BALANCE_PREVIEW_ENV_FILE="$env_file" \
  "$root/infra/scripts/bootstrap-preview-env.sh"

export APP_VERSION="$version"
compose=(docker compose --env-file "$env_file" -f "$root/docker-compose.preview.yml")

"${compose[@]}" build --pull
"${compose[@]}" up -d --remove-orphans
"${compose[@]}" ps

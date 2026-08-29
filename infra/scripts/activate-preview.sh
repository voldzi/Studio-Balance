#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="${1:-}"
env_file="${STUDIO_BALANCE_PREVIEW_ENV_FILE:-$root/.env.preview}"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <git-sha>" >&2
  exit 2
fi

for image in web api worker; do
  docker image inspect "studiobalance/$image:$version" >/dev/null
done

export APP_VERSION="$version"
compose=(docker compose --env-file "$env_file" -f "$root/docker-compose.preview.yml")
"${compose[@]}" up -d --no-build --remove-orphans
"${compose[@]}" ps

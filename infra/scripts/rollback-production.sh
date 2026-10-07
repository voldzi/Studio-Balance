#!/usr/bin/env bash
set -euo pipefail

root="${STUDIO_BALANCE_RELEASE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
version="${1:-}"
env_file="${STUDIO_BALANCE_PRODUCTION_ENV_FILE:-$root/.env.production}"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <previous-git-sha>" >&2
  exit 2
fi

if [[ ! -f "$env_file" || "$(stat -c '%a' "$env_file")" != "600" ]]; then
  echo "Production environment file is missing or does not have mode 0600." >&2
  exit 1
fi

for command in curl docker flock python3; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }
done

bash /srv/studio-balance/check-production-storage.sh

source /srv/studio-balance/production-operation-lock.sh
acquire_studio_operation_lock /srv/studio-balance/.production-operation.lock

if [[ ! -f "$root/docker-compose.production.yml" ]]; then
  echo "Rollback release does not contain docker-compose.production.yml." >&2
  exit 1
fi

for image in api web worker; do
  if ! docker image inspect "studiobalance/$image:$version" >/dev/null 2>&1; then
    echo "Rollback image studiobalance/$image:$version is unavailable." >&2
    exit 1
  fi
done

export APP_VERSION="$version"
compose=(docker compose --env-file "$env_file" -f "$root/docker-compose.production.yml" -f /srv/studio-balance/storage-compose.yml)
"${compose[@]}" up -d --no-build --remove-orphans

for _ in {1..30}; do
  if python3 /srv/studio-balance/verify-production-revision.py "$version"; then
    "${compose[@]}" ps
    echo "Production rolled back to $version."
    exit 0
  fi
  sleep 2
done

"${compose[@]}" ps >&2
echo "Rollback candidate did not become ready." >&2
exit 1

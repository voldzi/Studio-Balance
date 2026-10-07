#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="${1:-}"
env_file="${STUDIO_BALANCE_PRODUCTION_ENV_FILE:-$root/.env.production}"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <git-sha>" >&2
  exit 2
fi

if [[ ! -f "$env_file" ]]; then
  echo "Production environment file is missing." >&2
  exit 1
fi

for command in curl docker flock python3; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }
done

if [[ "$(stat -c '%a' "$env_file")" != "600" ]]; then
  echo "Production environment file must have mode 0600." >&2
  exit 1
fi

bash /srv/studio-balance/check-production-storage.sh

source /srv/studio-balance/production-operation-lock.sh
acquire_studio_operation_lock /srv/studio-balance/.production-operation.lock

for variable in DATABASE_URL DATABASE_URL_MIGRATOR PUBLIC_APP_URL OIDC_ISSUER_URL OIDC_WEB_CLIENT_ID OIDC_WEB_CLIENT_SECRET OIDC_ADMIN_CLIENT_ID OIDC_ADMIN_CLIENT_SECRET SESSION_SECRET; do
  if ! grep -q "^${variable}=" "$env_file"; then
    echo "Production environment file is missing ${variable}." >&2
    exit 1
  fi
done

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

export APP_VERSION="$version"
compose=(docker compose --parallel 1 --env-file "$env_file" -f "$root/docker-compose.production.yml" -f /srv/studio-balance/storage-compose.yml)
previous_image="$(docker inspect --format '{{.Config.Image}}' studio-balance-production-web-1 2>/dev/null || true)"
previous_version="${previous_image##*:}"

wait_for_revision() {
  local expected_version="$1"
  for _ in {1..30}; do
    if python3 /srv/studio-balance/verify-production-revision.py "$expected_version"; then
      return 0
    fi
    sleep 2
  done

  return 1
}

rollback_previous() {
  if [[ "$previous_version" =~ ^[0-9a-f]{7,40}$ && "$previous_version" != "$version" ]]; then
    echo "Restoring previous production revision $previous_version..." >&2
    local previous_root="/srv/studio-balance/releases/$previous_version"
    if [[ ! -d "$previous_root" || -L "$previous_root" || ! -f "$previous_root/docker-compose.production.yml" || -L "$previous_root/docker-compose.production.yml" ]]; then
      echo "Automatic rollback immutable release $previous_version is unavailable." >&2
      return 1
    fi
    # Image tags alone do not restore a release: the candidate Compose may
    # require entrypoints or healthcheck files absent from an older image.
    # Use the shared guarded rollback tool with that image's immutable sources.
    if ! STUDIO_BALANCE_RELEASE_ROOT="$previous_root" \
      STUDIO_BALANCE_PRODUCTION_ENV_FILE="$env_file" \
      bash "$root/infra/scripts/rollback-production.sh" "$previous_version"; then
      echo "Automatic rollback did not restore a healthy previous revision." >&2
      return 1
    fi
    echo "Previous production revision $previous_version was restored." >&2
  else
    echo "No validated previous production revision is available for automatic rollback." >&2
    return 1
  fi
}

if [[ "${STUDIO_BALANCE_PREBUILT_IMAGES:-0}" == "1" ]]; then
  up_args=(--no-build)
  for image in api web worker; do
    image_ref="studiobalance/$image:$version"
    architecture="$(docker image inspect --format '{{.Architecture}}' "$image_ref" 2>/dev/null || true)"
    if [[ "$architecture" != "amd64" ]]; then
      echo "Prebuilt image $image_ref is missing or has the wrong architecture." >&2
      exit 1
    fi
  done
  echo "Using prebuilt, versioned production images."
else
  up_args=()
  "${compose[@]}" build --pull
fi
# Do not replace a healthy revision with unscanned image contents. The scanner
# records and verifies the exact three image IDs before any container change.
bash "$root/scripts/scan-production-images.sh" "$version"
if ! "${compose[@]}" up -d "${up_args[@]}"; then
  rollback_previous || true
  exit 1
fi

if wait_for_revision "$version"; then
  "${compose[@]}" ps
  python3 /srv/studio-balance/record-verified-release.py "$version"
  exit 0
fi

"${compose[@]}" ps >&2
echo "Production candidate did not become ready; restoring the previous revision." >&2
rollback_previous || true
exit 1

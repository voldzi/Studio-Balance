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

command -v curl >/dev/null || { echo "curl is required." >&2; exit 1; }

if [[ "$(stat -c '%a' "$env_file")" != "600" ]]; then
  echo "Production environment file must have mode 0600." >&2
  exit 1
fi

for variable in DATABASE_URL DATABASE_URL_MIGRATOR; do
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
compose=(docker compose --env-file "$env_file" -f "$root/docker-compose.production.yml")

"${compose[@]}" build --pull
"${compose[@]}" up -d --remove-orphans

for _ in {1..30}; do
  if curl --fail --silent --show-error --connect-timeout 3 http://127.0.0.1:4281/ready >/dev/null \
    && curl --fail --silent --show-error --connect-timeout 3 --head http://127.0.0.1:3281/ >/dev/null; then
    "${compose[@]}" ps
    exit 0
  fi
  sleep 2
done

"${compose[@]}" ps >&2
echo "Production candidate did not become ready; public Nginx was not changed." >&2
exit 1

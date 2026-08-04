#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${STUDIO_BALANCE_PREVIEW_ENV_FILE:-$root/.env.preview}"
env_dir="$(dirname "$env_file")"

if [[ -f "$env_file" ]]; then
  exit 0
fi

umask 077
mkdir -p "$env_dir"
password="$(openssl rand -hex 32)"
temporary="${env_file}.tmp.$$"
printf 'POSTGRES_PASSWORD=%s\n' "$password" >"$temporary"
mv "$temporary" "$env_file"
chmod 600 "$env_file"

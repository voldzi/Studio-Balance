#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

remote_host="${STUDIO_BALANCE_PREVIEW_HOST:-voldzi@devapps.home.cz}"
preview_identity_file="${STUDIO_BALANCE_PREVIEW_IDENTITY_FILE:-$HOME/.ssh/id_ed25519_intranet_codex}"
ssh_options=(-i "$preview_identity_file" -o IdentitiesOnly=yes)
version="${1:-}"
remote_root="/home/voldzi/deployments/studio-balance"
release_dir="$remote_root/releases/$version"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <previous-git-sha>" >&2
  exit 2
fi

ssh "${ssh_options[@]}" "$remote_host" test -x "$release_dir/infra/scripts/activate-preview.sh"
ssh "${ssh_options[@]}" "$remote_host" \
  "STUDIO_BALANCE_PREVIEW_ENV_FILE=$remote_root/.env.preview" \
  "$release_dir/infra/scripts/activate-preview.sh" "$version"

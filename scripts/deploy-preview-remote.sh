#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="${STUDIO_BALANCE_PREVIEW_HOST:-voldzi@devapps.home.cz}"
preview_identity_file="${STUDIO_BALANCE_PREVIEW_IDENTITY_FILE:-$HOME/.ssh/id_ed25519_intranet_codex}"
ssh_options=(-i "$preview_identity_file" -o IdentitiesOnly=yes)
version="${1:-$(git -C "$root" rev-parse HEAD)}"

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 [git-sha]" >&2
  exit 2
fi

if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
  echo "Deployment refused: commit or stash local changes first." >&2
  exit 1
fi

remote_root="/home/voldzi/deployments/studio-balance"
release_dir="$remote_root/releases/$version"
artifact="$remote_root/artifacts/$version.tar"
archive="$(mktemp -t studiobalance-preview.XXXXXX.tar)"
trap 'rm -f "$archive"' EXIT

git -C "$root" archive --format=tar --output="$archive" "$version"
ssh "${ssh_options[@]}" "$remote_host" mkdir -p "$remote_root/artifacts" "$release_dir"
scp "${ssh_options[@]}" "$archive" "$remote_host:$artifact"
ssh "${ssh_options[@]}" "$remote_host" tar -xf "$artifact" -C "$release_dir"
ssh "${ssh_options[@]}" "$remote_host" \
  "STUDIO_BALANCE_PREVIEW_ENV_FILE=$remote_root/.env.preview" \
  "$release_dir/infra/scripts/deploy-preview.sh" "$version"

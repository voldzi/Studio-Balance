#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="dmz.home.cz"
remote_user="voldzi"
login_identity=""
local_home="$HOME"
codex_identity="${STUDIO_BALANCE_DMZ_CODEX_KEY:-$local_home/.ssh/id_ed25519_dmz_codex}"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/grant-dmz-codex-access.sh [--identity PATH] [--user USER] [--host HOST]

This runs on the local administration workstation. It uses your existing SSH
access and sudo authentication interactively, installs the restricted Codex
DMZ key and then verifies the new access in a separate SSH session.

--identity PATH  Existing private key that currently grants you access to DMZ.
--user USER      Remote administrator account (default: voldzi).
--host HOST      DMZ SSH hostname (default: dmz.home.cz).
USAGE
}

while (($#)); do
  case "$1" in
    --identity)
      shift
      login_identity="${1:-}"
      ;;
    --user)
      shift
      remote_user="${1:-}"
      ;;
    --host)
      shift
      remote_host="${1:-}"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

for command in ssh scp test; do
  command -v "$command" >/dev/null || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

if [[ -n "$login_identity" && ! -r "$login_identity" ]]; then
  echo "The supplied SSH identity cannot be read: $login_identity" >&2
  exit 1
fi

if [[ ! -r "$codex_identity" || ! -r "${codex_identity}.pub" ]]; then
  echo "The dedicated DMZ Codex key is missing: $codex_identity" >&2
  echo "Run this script from the prepared Studio Balance workstation." >&2
  exit 1
fi

bootstrap="$root/infra/nginx/bootstrap-codex-dmz-access.sh"
installer="$root/infra/nginx/install-studiobalance.sh"
for file in "$bootstrap" "$installer"; do
  [[ -r "$file" ]] || {
    echo "Required project file is missing: $file" >&2
    exit 1
  }
done

ssh_options=(-o StrictHostKeyChecking=accept-new)
if [[ -n "$login_identity" ]]; then
  ssh_options+=(-i "$login_identity" -o IdentitiesOnly=yes)
fi

remote_login="$remote_user@$remote_host"

echo "Checking your existing SSH access to $remote_login..."
ssh "${ssh_options[@]}" "$remote_login" true

remote_dir="$(ssh "${ssh_options[@]}" "$remote_login" 'mktemp -d /tmp/studiobalance-codex-dmz.XXXXXX')"
cleanup_remote() {
  ssh "${ssh_options[@]}" "$remote_login" rm -rf -- "$remote_dir" >/dev/null 2>&1 || true
}
trap cleanup_remote EXIT

echo "Copying the verified access bootstrap to DMZ..."
scp "${ssh_options[@]}" "$bootstrap" "$installer" "$remote_login:$remote_dir/"

echo "The next prompt is your sudo authentication on DMZ."
ssh -tt "${ssh_options[@]}" "$remote_login" \
  "sudo bash '$remote_dir/bootstrap-codex-dmz-access.sh'"

echo "Verifying the newly installed restricted Codex access..."
ssh -i "$codex_identity" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new "$remote_login" \
  'id; sudo -n /usr/local/sbin/studiobalance-install-nginx --help >/dev/null'

trap - EXIT
cleanup_remote
echo "Access is ready. Codex can now inspect DMZ and configure Studio Balance Nginx."

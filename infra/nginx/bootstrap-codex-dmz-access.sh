#!/usr/bin/env bash
set -euo pipefail

target_user="${STUDIO_BALANCE_DMZ_USER:-voldzi}"
public_key="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKz+tthsuPObT4nlipkNts2RXGxekxf7faP6bUc/6p+L codex@dmz.home.cz"
key_fingerprint="SHA256:B9q6yLIlqgOPxY9mwnAvDCmmfks17CuMTJy471Brcwg"
installer_sha256="9f855e032491f2af6cf4c6d41c84e0c5c6ed3e808a91dc30c7fce15f466b30f4"
installer_source="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install-studiobalance.sh"
installer_target="/usr/local/sbin/studiobalance-install-nginx"
sudoers_path="/etc/sudoers.d/studiobalance-codex-dmz"
mode="install"

usage() {
  cat <<'USAGE'
Usage:
  sudo bash bootstrap-codex-dmz-access.sh
  sudo bash bootstrap-codex-dmz-access.sh --revoke

Optional environment:
  STUDIO_BALANCE_DMZ_USER=voldzi

The install mode adds a dedicated restricted SSH public key and grants
passwordless sudo only for the root-owned Studio Balance Nginx installer.
The revoke mode removes that key, sudo rule and installed helper.
USAGE
}

case "${1:-}" in
  "") ;;
  --revoke) mode="revoke" ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

if ((EUID != 0)); then
  echo "Run this bootstrap with sudo or as root." >&2
  exit 1
fi

for command in getent install mkdir chown chmod grep awk mv rm visudo sha256sum id touch printf mktemp; do
  command -v "$command" >/dev/null || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

passwd_entry="$(getent passwd "$target_user" || true)"
if [[ -z "$passwd_entry" ]]; then
  echo "Target user does not exist: $target_user" >&2
  exit 1
fi

target_group="$(id -gn "$target_user")"
target_home="$(awk -F: -v user="$target_user" '$1 == user {print $6}' /etc/passwd)"
if [[ -z "$target_home" || ! -d "$target_home" ]]; then
  echo "Target home directory is missing for $target_user." >&2
  exit 1
fi

ssh_dir="$target_home/.ssh"
authorized_keys="$ssh_dir/authorized_keys"
key_blob="$(awk '{print $2}' <<<"$public_key")"

if [[ "$mode" == "revoke" ]]; then
  if [[ -f "$authorized_keys" ]]; then
    temporary="$(mktemp "${authorized_keys}.XXXXXX")"
    awk -v key="$key_blob" 'index($0, key) == 0' "$authorized_keys" >"$temporary"
    chown "$target_user:$target_group" "$temporary"
    chmod 600 "$temporary"
    mv "$temporary" "$authorized_keys"
  fi
  rm -f "$sudoers_path" "$installer_target"
  echo "Revoked Studio Balance Codex DMZ access for $target_user."
  exit 0
fi

if [[ ! -f "$installer_source" ]]; then
  echo "Missing sibling installer: $installer_source" >&2
  echo "Copy the complete infra/nginx directory before running this bootstrap." >&2
  exit 1
fi

actual_sha256="$(sha256sum "$installer_source" | awk '{print $1}')"
if [[ "$actual_sha256" != "$installer_sha256" ]]; then
  echo "Nginx installer checksum mismatch; refusing sudo installation." >&2
  echo "Expected: $installer_sha256" >&2
  echo "Actual:   $actual_sha256" >&2
  exit 1
fi

mkdir -p "$ssh_dir"
chown "$target_user:$target_group" "$ssh_dir"
chmod 700 "$ssh_dir"
touch "$authorized_keys"
chown "$target_user:$target_group" "$authorized_keys"
chmod 600 "$authorized_keys"

if ! grep -Fq "$key_blob" "$authorized_keys"; then
  printf 'restrict %s\n' "$public_key" >>"$authorized_keys"
fi

install -o root -g root -m 0755 "$installer_source" "$installer_target"

sudoers_temporary="$(mktemp /tmp/studiobalance-codex-sudoers.XXXXXX)"
trap 'rm -f "$sudoers_temporary"' EXIT
printf '%s ALL=(root) NOPASSWD: %s *\n' "$target_user" "$installer_target" \
  >"$sudoers_temporary"
chmod 0440 "$sudoers_temporary"
visudo -cf "$sudoers_temporary"
install -o root -g root -m 0440 "$sudoers_temporary" "$sudoers_path"
visudo -cf "$sudoers_path"

echo "Installed restricted Studio Balance DMZ access for $target_user."
echo "Authorized key fingerprint: $key_fingerprint"
echo "Passwordless sudo is limited to: $installer_target"
echo "Keep this terminal open until SSH and sudo are verified in a second session."
echo "To revoke: sudo bash $0 --revoke"

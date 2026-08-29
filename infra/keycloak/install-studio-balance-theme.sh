#!/usr/bin/env bash
set -euo pipefail

archive="${1:?path to the uploaded theme archive is required}"
base="/srv/vcode/apps/masaze/infra/keycloak/themes"
target="$base/studio-balance"
stamp="$(date -u +%Y%m%d-%H%M%S)"
stage="$(mktemp -d "$base/.studio-balance.install.XXXXXX")"
backup=""

cleanup() {
  rm -rf "$stage"
  rm -f "$archive"
}
trap cleanup EXIT

tar -xzf "$archive" -C "$stage"
candidate="$stage/studio-balance"

required=(
  login/theme.properties
  login/messages/messages_cs.properties
  login/messages/messages_en.properties
  login/resources/css/studio-balance-login.css
  login/resources/img/brand-logo.jpg
  login/resources/img/studio-hero.jpg
)

for file in "${required[@]}"; do
  [[ -s "$candidate/$file" ]] || { echo "Missing theme file: $file" >&2; exit 1; }
done

if find "$candidate" -type l -print -quit | grep -q .; then
  echo "Theme archive must not contain symbolic links." >&2
  exit 1
fi

chmod -R a+rX "$candidate"

if [[ -d "$target" ]]; then
  backup="$base/studio-balance.backup.$stamp"
  mv "$target" "$backup"
fi

if ! mv "$candidate" "$target"; then
  [[ -n "$backup" && -d "$backup" ]] && mv "$backup" "$target"
  exit 1
fi

echo "Installed Studio Balance Keycloak theme."
if [[ -n "$backup" ]]; then
  echo "Previous theme backup: $backup"
fi


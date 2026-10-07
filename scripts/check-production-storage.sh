#!/usr/bin/env bash
# Must run before creating paths, redirects, or containers which write to X5.
set -euo pipefail
mount=/srv/x5-production
expected=2f93f595-b61b-4eea-9054-7afa9b275b5b
[[ "$(findmnt -rn -M "$mount" -o UUID)" == "$expected" ]] || { echo 'X5 missing or UUID differs; refusing internal-disk fallback' >&2; exit 1; }
[[ "$(stat -c %d "$mount")" != "$(stat -c %d /srv)" ]] || exit 1
[[ "$(findmnt -rn -M "$mount" -o OPTIONS)" == *rw* ]] || exit 1
for category in backups archives cache staging; do
  target="$mount/$category/studio-balance"
  [[ -d "$target" && ! -L "$target" && -w "$target" ]] || { echo "Missing or unwritable $target" >&2; exit 1; }
  [[ "$(stat -c %d "$target")" == "$(stat -c %d "$mount")" ]] || exit 1
done
available=$(df --output=avail -k "$mount" | tail -1)
(( available >= 5 * 1024 * 1024 )) || { echo 'X5 reserve below 5 GiB' >&2; exit 1; }

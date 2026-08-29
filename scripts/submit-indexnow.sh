#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${PUBLIC_APP_URL:-https://studio-balance.cz}"
INDEXNOW_KEY="28e3eb8d0d6404759f80ae554439ed13"
INDEXNOW_ENDPOINT="${INDEXNOW_ENDPOINT:-https://api.indexnow.org/indexnow}"

case "$SITE_URL" in
  https://studio-balance.cz|https://www.studio-balance.cz) ;;
  *)
    echo "Refusing to submit an unexpected site URL: $SITE_URL" >&2
    exit 1
    ;;
esac

if [[ "$#" -eq 0 ]]; then
  set -- / /o-studiu /lekce /rozvrh /balance-flow /promeny /galerie /recenze /cenik /kontakt
fi

for path in "$@"; do
  if [[ "$path" != /* ]] || [[ "$path" == *\"* ]]; then
    echo "Each submitted value must be a safe absolute path: $path" >&2
    exit 1
  fi
done

payload="$({
  printf '{"host":"studio-balance.cz","key":"%s","keyLocation":"https://studio-balance.cz/%s.txt","urlList":[' "$INDEXNOW_KEY" "$INDEXNOW_KEY"
  separator=""
  for path in "$@"; do
    printf '%s"%s%s"' "$separator" "$SITE_URL" "$path"
    separator=,
  done
  printf ']}'
})"

curl --fail --silent --show-error \
  --header "content-type: application/json; charset=utf-8" \
  --data "$payload" \
  "$INDEXNOW_ENDPOINT"

echo "Submitted $# Studio Balance URL(s) to IndexNow."

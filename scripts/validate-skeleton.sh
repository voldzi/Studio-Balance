#!/usr/bin/env bash
set -euo pipefail

root="${1:-.}"
failures=0

ok() { echo "ok:   $*"; }
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}

require_file() {
  if [[ -f "$root/$1" ]]; then
    ok "$1 exists"
  else
    fail "$1 is missing"
  fi
}

require_dir() {
  if [[ -d "$root/$1" ]]; then
    ok "$1/ exists"
  else
    fail "$1/ is missing"
  fi
}

required_files=(
  README.md
  AGENTS.md
  CLAUDE.md
  .env.example
  docs/README.md
  docs/requirements.md
  docs/product-design.md
  docs/architecture.md
  docs/api.md
  docs/security.md
  docs/operations.md
  docs/observability.md
  docs/runbook.md
  docs/testing.md
  docs/infrastructure-assessment.md
  docs/delivery-plan.md
  docs/open-questions.md
  docs/source-register.md
  openapi/README.md
  openapi/openapi.json
)

for file in "${required_files[@]}"; do
  require_file "$file"
done

require_dir docs/adr
require_dir docs/archive

strip_compact() {
  sed '/^## Compact Instructions$/,$d' "$1" | grep -v '^[[:space:]]*$' || true
}

if [[ -f "$root/AGENTS.md" && -f "$root/CLAUDE.md" ]]; then
  if diff <(strip_compact "$root/CLAUDE.md") \
    <(grep -v '^[[:space:]]*$' "$root/AGENTS.md" || true) >/dev/null 2>&1; then
    ok "AGENTS.md and CLAUDE.md are aligned"
  else
    fail "AGENTS.md and CLAUDE.md differ beyond Compact Instructions"
  fi
fi

if python3 -m json.tool "$root/openapi/openapi.json" >/dev/null 2>&1; then
  ok "openapi/openapi.json is valid JSON"
else
  fail "openapi/openapi.json is not valid JSON"
fi

if grep -q 'openapi/openapi.json' "$root/docs/api.md"; then
  ok "docs/api.md references openapi/openapi.json"
else
  fail "docs/api.md does not reference openapi/openapi.json"
fi

if grep -R -nE '__PROJECT_NAME__|__PROJECT_ID__|(^|[^A-Z])TODO([^A-Z]|$)' \
  "$root/README.md" "$root/AGENTS.md" "$root/CLAUDE.md" \
  "$root/docs" "$root/openapi" >/dev/null 2>&1; then
  fail "active documentation still contains a template placeholder"
else
  ok "active documentation has no scaffold placeholders"
fi

echo
if [[ "$failures" -gt 0 ]]; then
  echo "Skeleton validation failed: $failures problem(s)."
  exit 1
fi

echo "Skeleton validation passed."

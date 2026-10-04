#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @studiobalance/web exec vitest run lib/public-analytics.test.ts
# Fail if the integration loses the private-session boundary or fixed runtime flags.
rg -q 'PublicAnalytics eligible=\{analyticsEligible\}' apps/web/app/layout.tsx
rg -q '!cookieStore.has\(identityCookies.session\) && !cookieStore.has\(adminIdentityCookies.session\)' apps/web/app/layout.tsx
rg -q 'autoClick: false, captureTitle: false, captureReferrer: false, credentials: "omit", offline: "discard"' apps/web/lib/public-analytics.ts

bash scripts/check-public-analytics-v2-preparation.sh

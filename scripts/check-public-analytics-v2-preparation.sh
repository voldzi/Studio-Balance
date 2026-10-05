#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @studiobalance/web exec vitest run lib/public-analytics-v2.test.ts lib/public-analytics-runtime.test.ts
rg -q 'selectPublicAnalyticsPlan' apps/web/components/public-analytics.tsx
rg -q 'analyticsEvent="outbound-click"' apps/web/components/massage-partner-section.tsx
rg -q 'analyticsEvent="outbound-click"' apps/web/components/social-links.tsx

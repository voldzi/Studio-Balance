#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:?Usage: check-analytics-release.sh <git-sha>}"
# Normal releases must retain the accepted production baseline. Emergency rollback
# remains a separate explicitly authorized rollback script, not a normal deployment.
if ! git -C "$root" merge-base --is-ancestor 9946f7e "$version"; then
  echo "Deployment refused: candidate omits accepted production baseline 9946f7e." >&2
  exit 1
fi
for path in apps/web/lib/public-analytics.ts apps/web/lib/public-analytics.test.ts apps/web/lib/public-analytics-notice.ts apps/web/components/public-analytics.tsx apps/web/components/public-analytics-notice.tsx scripts/check-public-analytics.sh docs/analytics/integration.md docs/analytics/privacy-review.md; do
  git -C "$root" cat-file -e "$version:$path" || { echo "Deployment refused: analytics integration missing $path." >&2; exit 1; }
done
if ! git -C "$root" show "$version:apps/web/app/layout.tsx" | rg -q 'PublicAnalytics eligible=\{analyticsEligible\}'; then
  echo "Deployment refused: analytics root-layout bridge missing." >&2
  exit 1
fi

# Preserve the approved activation in the actual release candidate, not only HEAD.
for flag in enabled privacyNoticeApproved; do
  git -C "$root" show "$version:apps/web/lib/public-analytics.ts" | rg -q "${flag}: true" || {
    echo "Deployment refused: approved analytics flag ${flag} is disabled." >&2; exit 1;
  }
done

# Preserve specifically approved v2 in the release candidate, with retained v1 fallback.
for flag in enabled privacyNoticeApproved; do
  git -C "$root" show "$version:apps/web/lib/public-analytics-v2.ts" | rg -q "${flag}: true" || {
    echo "Deployment refused: approved v2 flag ${flag} is disabled." >&2; exit 1;
  }
done

for path in apps/web/lib/public-analytics-notice-v2.ts apps/web/lib/public-analytics-v2.test.ts apps/web/components/public-analytics-link.tsx docs/analytics/expanded-metrics-review.md; do
  git -C "$root" cat-file -e "$version:$path" || { echo "Deployment refused: approved v2 file missing $path." >&2; exit 1; }
done
for path in apps/web/components/social-links.tsx apps/web/components/massage-partner-section.tsx; do
  git -C "$root" show "$version:$path" | rg -q 'analyticsEvent="outbound-click"' || { echo "Deployment refused: explicit outbound handler missing $path." >&2; exit 1; }
done
git -C "$root" show "$version:apps/web/lib/public-analytics-v2.ts" | rg -q 'sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5' || { echo "Deployment refused: approved v2 integrity changed." >&2; exit 1; }

git -C "$root" show "$version:apps/web/lib/public-analytics-v2.ts" | rg -q 'runtimePath: "/vcode-analytics-tiktok.js"' || { echo "Deployment refused: approved TikTok runtime path missing." >&2; exit 1; }
asset_sri="$(git -C "$root" show "$version:apps/web/public/vcode-analytics-tiktok.js" | openssl dgst -sha384 -binary | openssl base64 -A)"
[[ "sha384-$asset_sri" == "sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5" ]] || { echo "Deployment refused: shared TikTok runtime bytes changed." >&2; exit 1; }
git -C "$root" cat-file -e "$version:apps/web/lib/public-analytics-runtime.test.ts" || { echo "Deployment refused: shared runtime privacy tests missing." >&2; exit 1; }

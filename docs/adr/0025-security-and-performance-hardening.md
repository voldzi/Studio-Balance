# ADR 0025: Security and performance corrections after the October audit

Status: Accepted for implementation by the owner on 2026-10-07. Production
activation requires the normal coordinated release and acceptance checks.
Date: 2026-10-07

## Decision

Keep existing identity, storage, privacy scope and booking rules. Correct the
implementation without changing studio prices, bookings or capacity settings.

- Pin mature security releases Next.js 16.3.8, NestJS 12.1.2, Fastify 5.12.5
  and Sharp 0.35.5. Retain the 24-hour supply-chain age policy; a newer feature
  release is not required to close the reported advisories.
- Bind internal web/API HMAC to the exact body and a nonce. Deploy and roll
  back web/API together; reject the old protocol. Block the internal namespace
  on both the public web and Nginx.
- Keep mandatory admin MFA. Temporary identity failures return 503 and retain
  the credential; invalid tokens, credentials or roles revoke the session.
  Reduce fresh-session locks/writes without postponing 15-minute revalidation.
- Give production scripts per-response nonces and deny embedding, objects and
  external connections with CSP. Preserve approved same-origin analytics,
  exact runtime bytes/SRI and consent/session/privacy guards.
- Decode only JPEG/PNG/WebP signatures, with existing byte/pixel limits,
  metadata removal and WebP normalization. Uploaded media, including private
  previews, use `private, no-store` and recheck publication/consent. Approved
  static photography keeps its existing cache policy.
- Reserved, attended and no-show seats occupy capacity. Session locks serialize
  attendance/booking changes; cancellation keeps existing timing and fees.
  Mutations and their audit entries commit together.
- Bound booking lists to 100 entries per page using scoped keyset cursors and
  Prague date filters with loading/error/empty states. Public clients still see
  no numeric capacity. Compress only public schedule JSON at the edge.
- Require local PostgreSQL integration tests in CI. Verify all three deployed
  revisions, worker readiness and every retained backup checksum. Preserve X5
  mount guards, operation/media locks and scoped retention.

## Consequences and acceptance

No migration or new production secret is needed. API pool startup explicitly
allows 30 seconds of idle transaction time while bounded token/JWKS requests
complete. Privileged failures remain fail-closed. Replay protection is bounded
per process and does not survive restart; horizontal API scaling needs shared
nonce coordination.

Browser/PWA updates cannot retract saved images or cache entries created by an
older release. Consent withdrawal must unpublish all relevant associations;
future responses recheck those associations and prohibit caching.

Acceptance covers auth outage/rotation/MFA, media decoding/cache withdrawal,
concurrent capacity/attendance, audit rollback, pagination/DST, PostgreSQL
integration tests, build and rendered nonce/CSP/navigation checks. Production
publication and real-device acceptance are distinct from local test success.
Roll back web/API/worker together to a retained verified revision; do not mix
internal protocol versions or weaken release gates.

Primary dependency evidence:
[Next.js security release](https://nextjs.org/blog/september-2026-security-release),
[Sharp release](https://sharp.pixelplumbing.com/changelog/v0.35.5/) and the
registry audit recorded with the lockfile during validation.

### Scoped braces development-tool correction

The registry reports GHSA-vfj7-8cjw-p6xm for braces 3.0.3 and suggests 3.0.4,
which is not published. The [reviewed upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
lists no patched version and [upstream issue 70](https://github.com/micromatch/braces/issues/70)
remains open. Braces and micromatch masters retain the affected dependency;
there is no verified compatible upstream upgrade that removes this finding.

Use `pnpm patchedDependencies` for exactly braces 3.0.3 with a fixed
100-container depth guard in parse/compile/expand/stringify. Preserve ordinary
globs and enforce the guard for direct AST inputs too. Pin the patch and its
installed file hashes; run bounded input/AST/compatibility regressions against
the actual ESLint dependency path before evaluating audit results.

The audit gate prints an exception only for this exact GHSA/version and the
development-only Next ESLint path after the applied patch passes. There is no
persistent audit ignore or ignore-unfixable/registry-errors policy. New high
or critical findings, another version/path, a missing patch or an unavailable
registry fail the gate. Upstream counts remain visible, so the result is
"passed with a verified local patch", not "no upstream advisories".
Docker dependencies copy the patch before frozen installation. Replace the
patch with a reviewed published upstream fix when available. Delivery and
regression details are in [the patch record](../../patches/README.md).

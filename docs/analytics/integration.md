# Studio Balance shared analytics integration

Status 2026-10-04: prepared, disabled, registered; not deployed or collecting.
Repository: git@github.com:voldzi/Studio-Balance.git. Baseline production revision
8cbd727: Docker web/API/worker on docker.home.cz, public origin
https://studio-balance.cz through the Studio Balance Nginx virtualhost on dmz.home.cz.
The existing booking database and S3 storage are not analytics infrastructure.

## Contract and scope

VCode owns the single Umami service, registry, versioned `vcode-public-v1` runtime,
collector adapter, private dashboard, retention and backup/restore. The local bridge
only calls `pageview(sanitizedPath)` and passes the required restrictive flags;
no duplicated tracker, new Umami, database or public stats link is introduced.
Local configuration: `apps/web/lib/public-analytics.ts`, disabled with public websiteId `7d3e49ff-bbc0-4e56-8ecc-4a9d1965fd62`.
Exact allowed paths: `/`, `/o-studiu`, `/lekce`, `/rozvrh`, `/cenik`, `/galerie`,
`/recenze`, `/balance-flow`. No trailing-slash variants or dynamic lesson/session
paths. `/kontakt` (form), `/promeny` (personal stories), login, account, admin,
reservation, API and unknown routes are excluded. All views with an existing web
or admin session cookie are suppressed, even on these public paths. Presence of an
expired cookie conservatively suppresses collection as well. The layout evaluates
this server-side; no session identifier is serialized to the tracker. Authentication
must continue to use full navigation so root eligibility is recalculated; an SPA-only
authentication change requires an additional suppression signal before activation.

Only pathname is processed: no query, fragment, title, referrer, identity, booking,
form values, click, content identifier or arbitrary properties. DNT/GPC suppresses
runtime loading and pageviews. Offline visits are discarded, not queued/replayed.
Repeated rendering/Strict Mode and asynchronous loading must not duplicate a route;
a real return navigation to a public path can count again. Runtime errors must not
affect booking. Retention is 180 days, enforced by the shared service, not this bridge.

## Required endpoints and activation gate

Coordinated same-origin GET `/analytics/v1/tracker.js` and POST
`/analytics/v1/events`: these are integration requirements, NOT implemented API routes.
VCode coordinates their provision; do not modify DMZ virtualhosts concurrently. Serve only inside this site's
virtualhost. The shared runtime must match the declared contract, remain pinned to
its reviewed version and suppress credentials/referrer for requests. Script requests
may carry normal first-party browser cookies to Nginx: that static location must not
forward cookies to shared services or log sensitive headers. Collector requests must
use credentials omit and referrerPolicy no-referrer. Nginx must remove cookies,
authorization, query strings and untrusted forwarding headers; only the trusted edge
can supply client IP. Public collector cannot proxy dashboard/admin APIs. No edge or
shared-service changes have been made here. CSP remains same-origin; no external
script/connect origins are required. Exclude these endpoints from service-worker
caching and any queue; verify the existing worker does not cache them before activation.

1. Owner approves the exact CS/EN text in privacy-review.md in the VCode chat.
2. VCode has registered the Studio Balance websiteId above; confirm isolated test
   website, registry path approval and runtime/collector routes and version.
3. Review trusted-edge/header boundary, logs, 180-day retention and backup recovery.
4. Install and test same-origin endpoints inside the site's own virtualhost. Public
   privacy notice publication requires that approval; it is not published by this patch.
5. Set websiteId and enabled only in a reviewed release; run validate:analytics,
   lint, typecheck, web build and repo validation. Test isolated pageviews, DNT/GPC,
   offline discard, private routes, authenticated public views, Strict Mode, SPA
   transitions and runtime-load navigation race. Verify receiver rejects foreign
   origins, unknown paths/events, queries, oversized payloads and arbitrary properties.
6. Deploy through the normal production script; record SHA, shared runtime version,
   date collection started and authenticated private dashboard acceptance. Do not use
   fabricated production visits for tests. Zero visits alone is not proof of failure.

## Release and rollback

`pnpm validate:analytics` is part of validate:repo and hence pnpm check. This checks
allowlist, default-off configuration, suppression/deduplication and root integration.
It is local preparation evidence, not end-to-end collector acceptance. Activation
requires replacing the default-off assertion with an explicit approved configuration
check in the same release. Disable enabled immediately to stop runtime loading;
rollback to the previously validated production revision if needed. A failure of
analytics must never block public browsing, login or booking.

## Shared runtime review

The revised shared runtime was read from VCode services/analytics/public-v1.js and
its SHA-384 verified against the final SRI pinned by this bridge:
`sha384-lhej7Cxih2xEDtoPqh2B7mI4JilbkjF9HtVj+agiDEv8P6XAO98U6FJUCNpIVsMN`.
Its contractVersion is vcode-public-v1. Both its collector fetch and our script load
set referrerPolicy no-referrer; the initial missing fetch policy was corrected
centrally before activation. Explicit allowedEvents:[] is required. No shared file
was changed here. Unknown/failed runtime and version/integrity mismatch fail closed.
The exact production origin is required; localhost, preview and other domains cannot
create production pageviews. Production edge/header acceptance remains pending.

PublicAnalyticsNotice is prepared in the root layout but returns nothing while
privacyNoticeApproved is false. Czech text matches the owner-review draft; English
is supplied in privacy-review.md because the application currently has a Czech UI.
No draft text has been published. Keep both notice approval and enabled gates off
until review, pairing and collector acceptance complete. Existing PWA sw.js caches
only explicit static assets; analytics paths and POST requests are not cached/queued.

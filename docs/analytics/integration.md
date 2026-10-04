# Studio Balance shared analytics integration

Status 2026-10-04: prepared, disabled, registered; deployment validation recorded below.
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
create production pageviews. Central VCode reports isolated production edge/header acceptance complete; this
repository does not repeat ingestion tests against the real site statistics.

PublicAnalyticsNotice is prepared in the root layout but returns nothing while
privacyNoticeApproved is false. Czech text matches the owner-review draft; English
is supplied in privacy-review.md because the application currently has a Czech UI.
No draft text has been published. Keep both notice approval and enabled gates off
until review, pairing and collector acceptance complete. Existing PWA sw.js caches
only explicit static assets; analytics paths and POST requests are not cached/queued.

## Disabled deployment preparation — 2026-10-04

Central operations installed `include /etc/nginx/vcode-analytics/studio-balance.cz.conf;`
in the active HTTPS virtualhost. Never copy that private include or its token into
Git. This change does not edit DMZ. The centrally reported isolated acceptance covers
proxy ingestion/storage, private paths, foreign origins, arbitrary properties and
spoofed forwarding headers without changing real counts. Central VCode also reports
daily backups, isolated restore acceptance and a five-minute integration monitor.
These shared-service results are central evidence, not independently recreated here.

The normal `scripts/deploy-production-remote.sh` creates a local clean-commit Git
archive, sends it only to the authorized docker.home.cz production deployment
directory over SSH and builds versioned images there. It does not push to GitHub or
fetch source from GitHub. This approved artifact path preserves the 8cbd727 production
baseline and automatic rollback, resource preflight and readiness/version checks.
Use this private artifact path while the optional public GitHub push is blocked.
Only the isolated analytics branch is included; unrelated original-workspace edits
remain excluded. Owner review is still required before either enabled or
privacyNoticeApproved is switched on.

### Production receipt — 2026-10-04

Deployed application revision: `9946f7e` from clean local Git archive via the normal
private SSH artifact release. Previous baseline: `8cbd727`. Production readiness
reports version 9946f7e; API/web/worker all healthy. No GitHub push or DMZ change.
Both `enabled:false` and `privacyNoticeApproved:false` remain compiled into the release.
Public tracker GET now returns the final runtime; SHA-384 matches the pinned SRI.
An initial transient 404 was observed before the final successful verification.

Browser acceptance: homepage content/lesson list loaded, public schedule navigation
worked and the authenticated client account loaded. No analytics script exists in
DOM, the draft privacy section is absent and captured page-navigation requests show
zero `/analytics/` requests (capture complete, not truncated). Admin entry rendered
the login screen; authenticated admin operations were not retested and no credentials
or production bookings were entered. This is disabled-integration acceptance, not
activation, new analytics ingestion or revised admin identity acceptance.

Local gates passed: all 59 web tests (33 analytics guard/contract tests), lint,
web typecheck, repo/theme/OpenAPI validation and web production build. Common shared
receiver tests remain the responsibility/evidence of the central VCode deployment.
CS/EN draft matches the central owner-review revision. Publication and activation
remain pending explicit approval; no measured production visits were created.

### Canonical development adoption — 2026-10-04

The analytics source, public configuration, CS/EN draft, AGENTS/CLAUDE rules and
release tests have been adopted into the canonical development directory
`/Users/voldzi/Developer/18 2026/StudioBalance`. Existing uncommitted admin changes,
client decisions, document edits and moved source assets were preserved. Only
analytics changes were staged; existing operations/product-design edits remain
outside the analytics commit.

`scripts/deploy-production-remote.sh` now runs the analytics checks and
`scripts/check-analytics-release.sh` before creating or sending a release artifact.
The latter requires accepted production baseline 9946f7e in the candidate ancestry,
required integration/configuration/draft files and the root-layout bridge. A candidate
from the canonical directory's older historical branch must first incorporate the
accepted production history; it cannot silently overwrite current production or
remove analytics. The production-based analytics branch has the same guard.
Emergency rollback remains a separate authorized operation. This local adoption does
not activate analytics, publish the draft, push GitHub or replace production 9946f7e.

### Completion and pending review refresh — 2026-10-04

Production deployment completed as `905b19e`, replacing 9946f7e via the guarded
private artifact procedure. API/web/worker are healthy and readiness reports the
correct version. Release guard and all 33 analytics tests passed before transfer.
Browser reload captured zero analytics requests, no analytics script in DOM and
no published privacy draft. No GitHub push or DMZ modification was performed.

Central VCode then refined the pending review to revision ef5cbf7, clarifying general
browser/OS/device categories and exclusion of full headers and inferred location.
The unpublished local UI draft and CS/EN review file in both development directories
now use that exact current source and recorded SHA-256. Production 905b19e retains
the preceding hidden draft; neither version is published. At later approved
activation, release the ef5cbf7-aligned draft, not the earlier proposal. No new
approval was requested; the single central owner review remains pending.

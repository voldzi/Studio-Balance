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

### Approved activation — 2026-10-04

Owner approval was verified directly in the VCode thread: “Souhlasím”, recorded
in VCode 0527093, exact CS/EN source ef5cbf7. This supersedes the pending statuses
above. Frontend enabled=true, privacyNoticeApproved=true. Public text URLs are
https://studio-balance.cz/#public-analytics-privacy-title and
https://studio-balance.cz/#public-analytics-privacy-en (expand English).
The unchanged eight public paths, DNT/GPC/offline/session exclusions remain.
Ordinary release guard checks both flags in the actual candidate. Central registry
activation and final ingestion verification are separate coordinator steps.

### Activation deployment acceptance — 2026-10-04

Deployed SHA 37793c6; images studiobalance/web:37793c6, api:37793c6 and
worker:37793c6. All three healthy; /ready reports 37793c6 at 10:58:32 UTC.
Both frontend gates are true. Anonymous public HTML was parsed and all four CS
and all four EN paragraphs matched the exact owner-approved ef5cbf7 source.
The public anchors are documented above; English is expandable.

59 web tests, lint, typecheck, skeleton validation and release checks passed.
Browser admin login: no analytics script and zero analytics network requests
(complete capture). The existing signed-in browser is conservatively excluded
on public pages, so it does not render the anonymous-only supplement. Offline
navigation in that signed-in browser sent zero analytics requests; online mode
was restored. DNT/GPC suppression passed automated tests; browser simulation
was unavailable because addScriptToEvaluateOnNewDocument is unsupported. Do not
represent those tests as physical-device DNT/GPC acceptance.

No synthetic visits/payloads were inserted into the real website statistics.
Final central registry enablement and real ingestion proof await the coordinator's
announcement. No GitHub push or shared DMZ changes were made.

### Approved v2 candidate handoff — 2026-10-04

See expanded-metrics-integration.md and expanded-metrics-review.md. Verified owner
approval a56b160 for exact 6dc4dd3 paragraph. Prepared selector picks v2; production
v1 is unchanged until coordinator grants the deployment slot. Flags enabled=true,
privacyNoticeApproved=true, captureSources=true; allowedEvents=[outbound-click].
Exact original eight public paths, private session suppression and SRI preserved.

91 web tests, lint, typecheck, skeleton validation and local Next production build
passed. Local browser rendered both languages, expandable English and existing
three selected link types. At 360px document width and scrollWidth both equal 360;
no analytics script loads from localhost (exact production-origin guard). Local
content/API-dependent sections show their existing unavailable state because no
local API was started; no production data or credentials were used. No production
events, central build, registry or edge mutations were performed.

Public GET /analytics/v2/tracker.js verified byte-exact approved SHA384. Collector
POST not exercised against the real website. Tests use a synthetic UUID and mock
runtime. Intended release: guarded pnpm deploy:production -- <clean-candidate-sha>
from the production-based analytics branch, only after coordinator slot. No public
GitHub push. Central registry and final isolated ingestion acceptance are coordinated
by VCode; no claim of live v2 until deployment and acceptance complete.


### Approved v2 production deployment receipt — 2026-10-04

Production candidate 68fa497 was deployed through the standard guarded release
in the Studio Balance slot granted by the VCode coordinator. API /ready reports
version 68fa497 and status ok; web, API and worker containers all use the matching
68fa497 image tags and are healthy. Migration completed successfully. Local
acceptance documentation commits do not change the deployed revision.

Effective application plan: vcode-public-v2, enabled=true,
privacyNoticeApproved=true, captureSources=true, allowedEvents=[outbound-click].
Only the Masaze Jirina partner CTA and the Instagram/Facebook public anchors are
instrumented. Original eight public paths and server-side private-session
suppression remain unchanged. Contact/app-store events are not allowed here.
The shared pinned runtime is loaded from /analytics/v2/tracker.js, SRI
sha384-4mn0sN5UeFuzSjaXlbulwbJz7N38PPOovouC9Xp3OHD0r94YKgx8B2RAk/nK6mg0.

Anonymous public HTML was fetched without JavaScript and matched all four exact
approved paragraphs in each language (VCode 6dc4dd3, owner approval a56b160).
Public Czech notice: https://studio-balance.cz/#public-analytics-privacy-title
Public English notice: https://studio-balance.cz/#public-analytics-privacy-en
English is expandable. The supplement is intentionally excluded from sessions
bearing either application cookie.

The actual TypeScript adapter was compiled into an ephemeral localhost harness
and exercised in the in-app browser with the exact pinned VCode runtime. Fetch
was replaced only within the isolated harness with an in-memory sink using a
synthetic UUID; no events reached production. Nine browser checks passed:
pageview deduplication/explicit outbound event, source reduced to google without
raw referrer or query, omitted credentials/referrer, rejected unapproved events
and private/parameterized paths, DNT, GPC, offline discard, ineligible-session
suppression, and no offline replay. Screenshot evidence:
/tmp/studio-balance-v2-browser-test.png. This is browser-harness evidence, not a
physical-device test or evidence of central production ingestion.

Production browser verification used a temporary tab with both v1/v2 collector
URLs blocked. Admin login loaded zero analytics scripts and made zero analytics
requests (complete network capture). The existing signed-in browser was also
excluded on the public home page: zero scripts/requests and no anonymous notice;
public content loaded successfully. User cookies and original tabs were not
changed. The temporary tab, block rules and localhost test server were cleaned up.
91 web tests, lint/typecheck/local build and release gates passed for this
candidate; documentation skeleton validation passed after this receipt.

Initial attempts were refused before swapping production because disk free space
was below 20 GiB. Only old unused regenerable Docker build cache was pruned;
images, containers, volumes, production data and rollback images were untouched.
The successful attempt passed the standard disk/memory guard. No AKB service was
stopped. No central VCode registry or DMZ/edge changes and no GitHub push were made.

Application deployment and local/private browser acceptance are complete.
Final central registry enablement and isolated ingestion acceptance remain with
VCode; this receipt does not claim that live production events were ingested.


Subsequent VCode coordinator confirmation in thread
01a0ce37-c8c0-7212-9e29-71ed20a85297: the central migration for
studio-balance.cz completed with exit 0, and VCode confirmed the published
replacement and central v2 activation with captureSources=true and
allowedEvents=[outbound-click]. The server build/deploy slot has been released;
VCode is proceeding with its dashboard and other product releases. Central
activation is confirmed by VCode; Studio Balance's own acceptance above remains
isolated and does not claim separately observed real-user ingestion.


### TikTok runtime deployment receipt — 2026-10-05

Owner approval was verified directly in the VCode coordination thread (question
about TikTok recognition, explanation of service-only source without profile or
video data, and owner reply “ano doplň”). ADR 0023 records the narrow byte-exact
static runtime exception. Guarded release aa32034 was deployed successfully.
API /ready returned status ok and version aa32034; web, API and worker all run
studiobalance/{web,api,worker}:aa32034 and became healthy. Migration exited 0.
Image identities:
- web: sha256:619f0209df4a52505e873c255461158a5cf971b51518eeec956c93bed49e953e
- API: sha256:04d9f34df0bdc989f0b9973a43f20f0c9c9366731b95ee4c6250b0765632e506
- worker: sha256:2c6118fb043c9a069f50bddd89734040b619c485189152d57faa32230ca89d75

Public GET https://studio-balance.cz/vcode-analytics-tiktok.js returned 200,
application/javascript; charset=UTF-8, 2024 bytes, exact approved shared bytes.
SRI: sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5.
Public GET of /analytics/v2/tracker.js retained its original SHA384 exactly.
Anonymous HTML retained all four exact approved CS paragraphs and all four EN
paragraphs. Only GETs were used for HTTP acceptance; no collector POST was sent.

Lint, monorepo typecheck, 108 web tests, Next production build, analytics gates,
skeleton, Keycloak-theme and OpenAPI validation passed. Tests exercise the real
static runtime with the real adapter and a memory sink, including TikTok and
subdomains, rejected lookalike/private sources, private routes, unapproved events,
DNT/GPC, offline/no replay, session ineligibility, payload/credential restrictions
and pinned asset SHA384. The release guard passed aa32034 and rejected obsolete
68fa497 as an ordinary release missing the newly approved integrity.

Fourteen isolated in-app browser checks passed using a synthetic website UUID,
actual compiled adapter and the exact shared runtime, with fetch replaced only
inside the localhost harness by an in-memory sink. Evidence screenshot:
/tmp/studio-balance-tiktok-browser.png. This does not represent a physical phone
test or real production source ingestion. Production temporary-tab collector
URLs were blocked before public navigation. Admin login and the existing private
browser session on the public home each loaded zero analytics scripts and sent
zero analytics requests, with complete untruncated network capture. User cookies
and original tabs were unchanged; temporary tab, blocking and test server removed.

Contract remains vcode-public-v2; enabled=true, privacyNoticeApproved=true,
captureSources=true, allowedEvents=[outbound-click], same website ID, same eight
public paths and /analytics/v2/events. No Nginx edge or central registry change,
no production test visits and no public GitHub push were performed. Unrelated
local admin/docs/source-asset work remains intact. The build/deploy is complete;
VCode can update the central private trackerPath/SRI registry from this receipt.
No separate claim of real-user ingestion is made. Documentation-only commits
following aa32034 do not change the deployed source/image.

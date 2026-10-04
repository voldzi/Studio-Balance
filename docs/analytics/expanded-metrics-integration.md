# Studio Balance — approved v2 release candidate, not yet deployed

VCode source 6dc4dd3; owner approval a56b160 verified directly in the owner thread.
Local candidate selects v2 with enabled=true and privacyNoticeApproved=true,
captureSources=true, allowedEvents=[outbound-click]. Production remains the
previous v1 revision until the coordinated deployment slot. Runtime is not copied;
matched proxy/registry and per-site acceptance are required at migration. Exact SRI:
`sha384-4mn0sN5UeFuzSjaXlbulwbJz7N38PPOovouC9Xp3OHD0r94YKgx8B2RAk/nK6mg0`.

Paths remain exactly /, /o-studiu, /lekce, /rozvrh, /cenik, /galerie, /recenze,
/balance-flow. Prepared GET /analytics/v2/tracker.js and POST /analytics/v2/events;
existing v1 paths unchanged. The central runtime owns source normalization to its
fixed public-service enum. The adapter never passes document referrer, query,
fragment, title, destination URL, link text or arbitrary properties.

Explicit outbound-click links only:
- Homepage: MassagePartnerSection, “Poznat Masáže Jiřina”.
- Public page footers: SocialLinks, Instagram and Facebook.
SocialLinks also occurs on /kontakt; that path remains excluded, so those clicks
send nothing there. /kontakt navigation itself is not counted as a contact option.
No telephone/e-mail/contact action or App Store link exists; contact-click and
app-store-click are therefore not allowed. No listener on document/body.

A runtime event is discarded until the eligible root bridge initializes and after
its cleanup. Each event rechecks current canonical route, session eligibility,
DNT/GPC, online status and exact origin. No queue, retries or delayed replay.
The pure adapter retains SPA pageview deduplication. v1 source text is retained for fallback; exact
CS/EN replacement is approved but not yet deployed in expanded-metrics-review.md and
public-analytics-notice-v2.ts. The selected notice replaces only the approved affected paragraph.

No central build, deployment, registry, edge or production changes are part of
this preparation. Ordinary release guard retains the approved v2 flags, exact SRI
and explicit handlers. Enabled approved v1 remains a tested fallback.

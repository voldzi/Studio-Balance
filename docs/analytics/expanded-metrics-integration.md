# Studio Balance — approved public analytics v2

VCode source 6dc4dd3; owner approval a56b160 verified directly in the owner thread.
Local candidate selects v2 with enabled=true and privacyNoticeApproved=true,
captureSources=true, allowedEvents=[outbound-click]. v2 was deployed as 68fa497
on 2026-10-04 and activated by VCode. The owner authorized the TikTok addition
on 2026-10-05. ADR 0023 permits a byte-exact pinned shared static asset
/vcode-analytics-tiktok.js without changing the protected Nginx edge. Exact SRI:
`sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5`.

Paths remain exactly /, /o-studiu, /lekce, /rozvrh, /cenik, /galerie, /recenze,
/balance-flow. GET /vcode-analytics-tiktok.js and POST /analytics/v2/events;
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
CS/EN replacement is approved and deployed in expanded-metrics-review.md and
public-analytics-notice-v2.ts. The selected notice replaces only the approved affected paragraph.

TikTok changes only the pinned runtime path/bytes and integrity. Existing
CS/EN text and all data boundaries remain. The central registry is updated by
VCode after deployment; this application never modifies it or the edge. Ordinary release guard retains the approved v2 flags, exact SRI
and explicit handlers. Enabled approved v1 remains a tested fallback.

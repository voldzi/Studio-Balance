# ADR 0022: Public sources and explicit outbound clicks

Date: 2026-10-04. Status: accepted; exact replacement 6dc4dd3 and activation
approved by the owner in VCode a56b160. Supersedes ADR 0021's no-click/no-source
restriction only for this reviewed scope. Deployment waits for coordinator slot.

Use the central vcode-public-v2 runtime, pinned SRI, captureSources=true and only
outbound-click from the existing Masáže recommendation and Instagram/Facebook
links. No App Store or contact event exists. Keep the original exact eight public
paths; exclude /kontakt as before. Do not send target URL, content, account data,
raw referrers, query/fragment/title or any additional properties. Preserve private
session, origin, DNT/GPC and offline boundaries, SPA dedupe and no replay.

Replace precisely the affected CS/EN paragraph, retain the approved introduction
and other paragraphs. Preserve v1 implementation as a tested fallback; no runtime
copy, second collector, database, automatic document listener or shared build.
Release checks protect the reviewed configuration, integrity, notice and handlers.

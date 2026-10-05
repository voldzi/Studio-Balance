# ADR 0023: Pinned shared runtime with TikTok source

Date: 2026-10-05. Status: accepted for the owner-authorized TikTok addition.
Owner approval was verified directly in the VCode thread
01a0ce37-c8c0-7212-9e29-71ed20a85297: request to recognize TikTok, explanation
that only the service label is stored (no profile/video), followed by “ano doplň”.

This supersedes only ADR 0022's prohibition on copying the shared runtime.
VCode provided an immutable byte-exact shared runtime public-v2-tiktok.js. Serve
that file as /vcode-analytics-tiktok.js from the application, pin its SHA384 and
check the asset in release gates. It remains VCode-owned code, not a locally
forked tracker. Do not alter the existing protected /analytics/v2/tracker.js or
Nginx edge. Future runtime changes require review and a new pinned release.

SRI: sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5.
Only runtimePath and runtimeIntegrity change. Keep vcode-public-v2, the website
ID, /analytics/v2/events, the exact eight public paths, captureSources=true,
allowedEvents=[outbound-click], both approval/activation gates, session exclusion,
DNT/GPC, credentials omit, offline discard and the exact existing CS/EN notice.
Only tiktok.com and its subdomains normalize to tiktok; lookalike suffixes do not.
No raw referrer, profile, video, destination or query is transmitted.

Deploy through the standard Studio Balance guarded release. VCode updates the
central private registry after the verified app release. Do not modify it here.
Acceptance uses blocked collection or an isolated memory sink, never real visits.

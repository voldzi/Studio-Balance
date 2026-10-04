# ADR 0021: Shared public analytics

Date: 2026-10-04. Status: accepted; owner approved exact ef5cbf7 CS/EN notice
and public-page activation in VCode, approval record 0527093. See docs/analytics/integration.md.

Use the common versioned VCode runtime and same-origin adapter with one independent
site registry entry. Measure only exact general public paths, suppress authenticated
visits, DNT/GPC and offline activity. No clicks, dynamic IDs, forms or bookings.
Do not copy collection logic or create another analytics service/database.

The bridge is paired and enabled with the approved notice. Failure is non-blocking.
The central registry is activated only after public notice acceptance. Existing product
metrics concerning booking remain operational/audit information, not public analytics.

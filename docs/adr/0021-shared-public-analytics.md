# ADR 0021: Shared public analytics, disabled preparation

Date: 2026-10-04. Status: integration design accepted for preparation; activation
and privacy notice owner review pending. See docs/analytics/integration.md.

Use the common versioned VCode runtime and same-origin adapter with one independent
site registry entry. Measure only exact general public paths, suppress authenticated
visits, DNT/GPC and offline activity. No clicks, dynamic IDs, forms or bookings.
Do not copy collection logic or create another analytics service/database.

The bridge ships disabled and unpaired. Failure is non-blocking. Active collection,
edge routes and privacy publication are a separate reviewed release. Existing product
metrics concerning booking remain operational/audit information, not public analytics.

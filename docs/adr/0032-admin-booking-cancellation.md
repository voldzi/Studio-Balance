# ADR 0032: Administrative cancellation of selected seats

Status: accepted (CD-074, 2026-10-18).

## Context

The operator needs to release a seat on a client's request before a lesson.
Attendance/no-show does not release capacity and cannot substitute cancellation.

## Decision

Use separate MFA-admin preview/apply endpoints, with a state fingerprint covering
selected persons, booking snapshots, free-change window, session version, mode,
reasons and fee policy. The apply transaction recalculates the fingerprint and
rejects changes, including crossing the 24-hour cutoff. It locks relevant tables
before owner/session/booking rows, consistent with booking creation, and never
changes a client's identity session. Both-seat scope only selects reserved seats
of the same owner and session. Existing financial records block this operation.

Standard late cancellation inserts a due fee; explicit waiver inserts a waived
fee and records the waiver reason in the audit. Do not remove financial history.
Cancellation and fee insertion, account notices, outbox invalidation and audit
commit together. No online charge or external outbound notification is added.

A dedicated admin_booking_cancellation_receipts table stores actor-scoped keys,
request hashes and small non-personal response receipts. A transaction advisory
lock serializes the same actor/key; owner/session locks serialize capacity and
client cancellation races. Changed payload under a reused key conflicts. No new
automatic deletion policy for receipts/audit is introduced. Existing client
booking idempotency stays separate and its response contract is unchanged.

## Consequences and rollback

Migration 0033 is additive. Deploy API/web together. Existing app versions ignore
the new table, so application rollback keeps receipts and already committed
cancellations/fees. Do not roll data back by recreating cancelled reservations.
A changed or started lesson requires fresh review/attendance, not force apply.
Public booking windows remain unchanged even when a place becomes free.

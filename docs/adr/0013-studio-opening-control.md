# ADR 0013: Otevření studia a registrací

Status: accepted, 2026-09-05. Source: CD-047 / CD-048.

PostgreSQL singleton stores desired opening and confirmed registration sync.
Booking requires both flags and locks the singleton FOR SHARE in its transaction.
Admin changes take an exclusive row lock, persist desired state and pending sync,
then synchronize Keycloak registrationAllowed under a row lock. Public availability
is closed until synchronization succeeds. Pending synchronization retries after
startup and every 30 seconds, recovering an interrupted change without claiming success.
A Keycloak outage leaves booking closed and the admin sees pending synchronization;
registration may still reflect the previous Keycloak state until retry succeeds.
No distributed transaction is claimed. The admin can retry or request closed state.

A dedicated confidential service account in the studio-balance realm has only
realm-management/manage-realm, needed by Keycloak's realm update API. This role
can change more realm settings than registrationAllowed; protect its secret as an
API-only operations credential. No master admin credential enters application runtime.
The application sends only registrationAllowed, never overwrites realm configuration.
Separate local credentials are provisioned exclusively in local Keycloak.

Public status is no-store. Browser refreshes it on focus and every 30 seconds; API
booking checks remain authoritative even with an old page. Account access and
cancellation rules are unaffected. Existing bookings require human review if the
studio cannot deliver them; this switch does not cancel or charge anyone.

The PWA guide uses a body portal and native modal dialog independent of mobile
navigation visibility, with Escape, focus containment and return to menu summary.

The API joins the existing keycloak_default Docker network and uses the trusted
internal realm URL for token and admin API requests; the public issuer stays unchanged.

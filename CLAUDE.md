# Project Agent Guide

## Mission

This repository contains the Studio Balance product: a responsive public and
client website, shared booking experience, web administration, common API, and
one source of operational data. The product must feel calm, elegant, simple,
and consistent with the real studio while keeping booking rules unambiguous.

## Working Style

- Prefer retrieval-first work over broad repository scanning.
- Use Chroma `search_code`, `search_docs`, or `search_all` before reading many
  files. Use `get_file_context` after choosing a useful hit.
- If Chroma MCP tools are unavailable, use:
  `"/Users/voldzi/Developer/18 2026/chromadb/tools/chroma-dev.sh" search-all "<query>" --root . --limit 5`
- If retrieval is unavailable or insufficient, inspect files directly and say
  so once. Do not let retrieval block delivery.
- Reindex after meaningful repository changes with the available Chroma MCP
  tool or `chroma-dev reindex --root .`.

## Source of Truth and Precedence

1. `docs/client-decisions.md` contains binding client decisions made after the
   original brief and overrides it only where it explicitly changes scope.
2. `docs/01 Zadání/STUDIO_BALANCE_ZADANI_PRO_VYVOJ.md` is the original binding
   client brief. The decomposed Unicode folder name on disk may render
   differently; resolve it by filename rather than creating a duplicate folder.
3. `docs/requirements.md` and the flat active documents in `docs/` translate
   the brief into development rules. Update them when the product changes.
4. `openapi/openapi.json` is the binding REST contract for paths it defines.
5. Source code and tests must implement the preceding contracts.
6. DOCX files and images in `docs/01 Zadání/` are supporting references only.
   They never override the binding brief. See `docs/source-register.md`.

If two active sources conflict, stop and resolve the conflict in documentation
before encoding one interpretation in code.

## Product Invariants

- No online payment, stored card, checkout, Apple Pay, or Google Pay.
- No client-side permanentka/pass balance or online pass purchase.
- No waiting list and no notification when a place becomes free.
- Never expose numeric capacity or remaining-place counts to public clients.
- One booking database serves public/client web and administration.
- Booking capacity and duplicate prevention are enforced transactionally by the
  backend, not inferred in the UI.
- The cancellation boundary is exact: at least 24 hours before the session is
  on-time; less than 24 hours is late. Evaluate instants using the session's
  `Europe/Prague` local-time definition.
- Late cancellation and no-show create an administrative fee equal to the
  snapshotted lesson price; money is handled only in the studio.
- A studio-cancelled session never creates a cancellation fee.
- Public schedule browsing does not require an account; booking does.
- Content, schedule, and booking data shared by all web surfaces come from one
  source, not hardcoded client lists.
- The product is responsive web only. Do not add a native iOS/Android app,
  Expo/React Native workspace, app-store release, or mobile push provider.
- Identity uses the dedicated Keycloak `studio-balance` realm with separate
  web/admin OIDC policies, Authorization Code + PKCE, server-side HTTP-only
  sessions, simple client registration without e-mail verification while SMTP
  is unavailable, and mandatory admin MFA. See ADR 0004.
- Production application workloads run as Docker containers on
  `docker.home.cz`.
- Public traffic for `https://studio-balance.cz` is published
  through Nginx on `dmz.home.cz` before reaching `docker.home.cz`.
- The dedicated Studio Balance realm is exposed at
  `https://login.studio-balance.cz`; `www.studio-balance.cz` redirects to the
  canonical origin. No Studio Balance hostname on `zeleznalady.cz` is required.
- Production PostgreSQL is accessed through `haproxy.home.cz:5000`; do not
  configure or document a direct database-node endpoint.
- Local development dependencies run in Docker Desktop and never use
  production data or credentials.
- PostgreSQL is the system of record for relational and booking data.
  Production media use S3-compatible storage on `docker.home.cz` only through a
  dedicated Studio Balance bucket, credentials, backup policy, and approved
  network boundary; do not reuse another application's tenant credentials.

## Repository Standards

- Follow the central standards in
  `/Users/voldzi/Developer/18 2026/chromadb/docs/standards/`.
- Keep `README.md`, `AGENTS.md`, `CLAUDE.md`, `.env.example`, the flat mandatory
  documents, `docs/adr/`, and `openapi/openapi.json` present.
- Keep `AGENTS.md` and `CLAUDE.md` aligned except for Claude's trailing Compact
  Instructions section.
- JSON-first OpenAPI: never add or change a REST endpoint without updating
  `openapi/openapi.json` and `docs/api.md`.
- All errors use `ErrorResponse` with `code`, `message`, and `requestId`.
- Logs are structured and include `timestamp`, `level`, `service`, `message`,
  `requestId`, `environment`, and `version`.
- Never commit secrets. Keep `.env.example` and the configuration table in
  `docs/operations.md` synchronized.
- Add an ADR for a significant decision or to supersede an earlier decision.
- Keep current-state documentation in `docs/`; archive historical material in
  `docs/archive/`.

## Environment

The repository is a pnpm TypeScript monorepo with Next.js web, NestJS/Fastify
API, a worker, shared packages, PostgreSQL 18 migrations, and a local Keycloak
realm. The canonical remote is `git@github.com:voldzi/Studio-Balance.git`;
production runs in Docker on `docker.home.cz`, public traffic for
`https://studio-balance.cz` passes through Nginx on `dmz.home.cz`,
production PostgreSQL is reached only through `haproxy.home.cz:5000`, and local
services run in Docker Desktop.

Required local tooling is Node.js 24–26, pnpm 11, and Docker Desktop. Use:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm dev
```

The web runs on port 3000, the API on 3001, and local Keycloak on 8081. Main
checks are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
`pnpm validate:repo`, or the complete `pnpm check` gate. Never point local
configuration at production data, credentials, or the production Keycloak
realm.

An isolated non-public preview may be deployed from a clean Git commit with
`pnpm deploy:preview -- <git-sha>` and rolled back to an already built revision
with `pnpm rollback:preview -- <previous-git-sha>`. It uses host ports 3280 and
4280 plus its own unexposed PostgreSQL volume. Do not treat it as production or
connect it to DMZ, HAProxy PostgreSQL, production Keycloak, or S3 without the
separate accepted change described in ADR 0006.

DMZ publication is prepared by `infra/nginx/install-studiobalance.sh` according
to ADR 0007. It must be run on `dmz.home.cz` with sudo, an explicit
`--activate-preview` flag, and the real ACME contact email. Never bypass its
upstream checks, Nginx validation, backup, TLS, or rollback behavior.

## Product and UI Work

- Read `docs/product-design.md` before changing any user-facing surface.
- Use only the approved official logo and approved real photography in
  production. Current raster references are not proof of final approval.
- Represent loading, empty, disabled, success, validation, system-error, and
  permission-denied states.
- Target WCAG 2.2 AA, mobile web from 360 px, keyboard operation, visible focus,
  reduced motion, and usable touch targets.
- Do not copy disallowed elements from visual references, including remaining
  place counts, referral discounts, or features outside the first-version scope.

## Validation

- Always run `bash scripts/validate-skeleton.sh` after changing the repository
  structure or active documentation.
- Run the smallest relevant test set once a stack and tests exist.
- API changes require OpenAPI validation and contract tests.
- Booking changes require boundary, concurrency, idempotency, authorization,
  DST, and cancellation-fee tests from `docs/testing.md`.
- UI changes require responsive, accessibility, component-state, and critical
  journey checks from `docs/product-design.md`.
- If a check cannot run, report it explicitly.

## Change Discipline

- Preserve the original files under `docs/01 Zadání/`.
- Do not silently broaden or reduce scope.
- Treat assumptions in `docs/open-questions.md` as unresolved, not permission to
  choose the most convenient implementation.
- Update affected requirements, API, security, operations, observability,
  testing, and product-design documents in the same change as behavior.
- Avoid provider-specific architecture until the corresponding decision is
  accepted.

## Compact Instructions

- Preserve the task goal, touched files, decisions, commands run, validation
  status, open questions, and whether retrieval was available or insufficient.

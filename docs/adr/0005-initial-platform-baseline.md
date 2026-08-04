# ADR 0005: Výchozí aplikační a vývojová platforma

- Status: Accepted
- Datum: 2026-08-04
- Rozhodl: technická implementace v mezích ADR 0002–0004

## Kontext

ADR 0003 schválilo web-only TypeScript monorepo, ale neurčilo přesné verze,
základní příkazy ani první provozní řez. Vývoj potřebuje reprodukovatelný základ,
který ověří web, API, worker, PostgreSQL 18, Keycloak a strojový OpenAPI kontrakt
bez předčasného uzamčení rezervačního modelu nebo ORM.

## Rozhodnutí

1. Workspace používá pnpm 11, Node.js 24–26 a TypeScript 5.9.
2. První verze scaffoldu používá Next.js 16/React 19, NestJS 11 s Fastify 5 a
   samostatný Node worker.
3. OpenAPI JSON generuje sdílené TypeScript typy balíčku
   `@studiobalance/contracts`; ruční paralelní API typy se nevytvářejí.
4. Lokální Docker Compose obsahuje PostgreSQL 18.4 a Keycloak 26.1.5 s
   verzovaným vývojovým realm importem. Lokální PostgreSQL používá host port
   5433, aby nekolidoval s běžnou lokální instalací na 5432.
5. První databázová migrace vytváří jen technický auditní základ. Migrace jsou
   dopředné SQL soubory s checksumem, transakcí a PostgreSQL advisory lockem.
6. Pro spojení a readiness se zatím používá nízkoúrovňový driver `pg`. Volba
   ORM/query builderu pro doménový model zůstává otevřená do booking/datového
   spike; tento řez ji nepředjímá.
7. CI a lokální `pnpm check` spouští lint, typovou kontrolu, testy, build,
   validaci kostry a OpenAPI JSON.
8. První webový povrch používá pouze text, CSS a výchozí neschválené design
   tokeny. Neobsahuje neověřené fotografie ani napodobeninu produkčního loga.

## Důsledky

- vývoj lze spustit bez produkčních dat a credentials;
- `/health` ověřuje proces a `/ready` skutečné DB spojení;
- request ID a povinná strukturovaná logovací pole existují od prvního řezu;
- produkční image, S3, e-mail, OIDC session integrace a doménové schema jsou
  další samostatné řezy;
- před přidáním doménového ORM/query builderu se toto ADR doplní nebo nahradí
  následným rozhodnutím.

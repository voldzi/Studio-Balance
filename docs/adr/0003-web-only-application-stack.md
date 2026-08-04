# ADR 0003: Web-only aplikační stack

- Status: Accepted
- Datum: 2026-08-04
- Rozhodl: zadavatel Studio Balance
- Nahrazuje: ADR 0001

## Kontext

Původní ADR 0001 navrhovalo vedle webu také Expo/React Native aplikaci. Zadavatel
později rozhodl, že produkt bude pouze responzivní web. Zároveň schválil
TypeScript monorepo směr a PostgreSQL 18. Produkční topologie je přijata v
ADR 0002.

## Rozhodnutí

Použít TypeScript monorepo a modulární monolit:

```text
apps/
  web/       Next.js: veřejný web, klientský účet a oddělená admin oblast
  api/       NestJS s Fastify adapterem: REST, doména a autorizace
  worker/    outbox, e-mail, media processing a plánované úlohy
packages/
  contracts/ typy generované z OpenAPI
  domain/    čisté typy a pravidla bez DB nebo UI závislosti
  ui-tokens/ společné webové design tokeny
```

Správa workspace je `pnpm`. Turborepo se přidá pouze při měřitelné potřebě;
základ může začít jako prostý pnpm workspace. Produkční relační data používají
PostgreSQL 18 přes `haproxy.home.cz:5000`. Produkční binární média používají
S3-kompatibilní úložiště podle ADR 0002. API je JSON-first OpenAPI `/api/v1`.

Web a administrace mohou být jeden deploy, ale mají oddělené routes, layout,
přihlašovací vstup, role a security boundary. API a worker sdílejí doménové
moduly; mikroslužby nejsou cílem první verze.

Keycloak 26.1.5 dostupný na `docker.home.cz` je preferovaný OIDC kandidát.
Konkrétní realm, klienti, issuer URL, email verification, MFA, lokální Compose
instance a provozní vlastnictví se uzavřou před implementací identity.

## Důvody

- jeden jazyk drží kontrakty webu, API a workeru konzistentní;
- Next.js podporuje indexovatelný veřejný obsah i transakční klientské UI;
- NestJS/Fastify poskytne jasnou doménovou a autorizační hranici;
- PostgreSQL poskytuje transakce, constraints a locking pro kapacitu;
- OpenAPI je jeden strojový kontrakt pro web a administraci;
- existující S3 a OIDC infrastrukturu lze využít s vlastní tenant izolací;
- modulární monolit je provozně jednodušší než distribuované mikroslužby;
- vynechání nativních klientů odstraňuje app-store release, duplicitní UI a
  mobilní push infrastrukturu.

## Zvažované varianty

### A. Jeden Next.js proces bez samostatného API frameworku

Má méně komponent, ale hůře odděluje bohatou rezervační doménu, administrativní
autorizaci, background joby a dlouhodobý API kontrakt. Nebyl zvolen.

### B. Nativní nebo cross-platform mobilní aplikace

Původní brief ji požadoval, ale zadavatel ji rozhodnutím CD-006 výslovně vyřadil
z rozsahu. Expo/React Native workspace se nevytváří.

### C. Mikroslužby od první verze

Přidávají distribuované transakce, více deployů a observability zátěž bez
doložené potřeby. Nejsou zvolené.

## Důsledky

Pozitivní:

- jedna implementace rezervačních pravidel a autorizace;
- přirozený SSR/SEO web a responzivní klientský účet;
- jednodušší CI, release a testovací matice bez app stores;
- jasná cesta k workeru, idempotentnímu e-mailu a media pipeline.

Náklady a rizika:

- monorepo potřebuje disciplinované hranice a kontraktní testy;
- NestJS i Next.js mohou být pro malý tým těžší, proto scaffold zůstane štíhlý;
- OIDC/Keycloak integrace potřebuje rozhodnutí o realm/client/MFA a provozu;
- oddělené API nesmí duplikovat autentizační logiku ve webu;
- kompatibilita PostgreSQL 18, HAProxy a zvoleného ORM se musí ověřit spike
  testem včetně transakcí posledního místa.

## Implementační podmínky

Před identity řezem:

- schválit Keycloak/OIDC model, issuer URL, klientské a admin policies;
- rozhodnout ověření e-mailu a admin MFA;
- spustit projektovou Keycloak instanci v Docker Desktop nebo schválit jinou
  reprodukovatelnou lokální cestu.

Před booking řezem:

- získat odpovědi z `client-questionnaire-booking-rules.md`;
- promítnout je do requirements, OpenAPI a testů;
- ověřit transakční booking spike na PostgreSQL 18.

Před produkcí:

- dokončit Docker/Nginx release a rollback workflow;
- bezpečně vytvořit produkční DB/role interaktivním verzovaným skriptem;
- zprovoznit vyhrazený S3 tenant a prokázat backup/restore;
- vyřešit kapacitu `docker.home.cz` a všechny readiness blokery.

## Následné rozhodnutí

Identity podmínky tohoto ADR uzavírá ADR 0004. Keycloak, realm, klienti, issuer,
email verification a admin MFA jsou schválené; zbývá jejich implementace a
provozní provisioning.

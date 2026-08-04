# Provoz a konfigurace

## Aktuální stav

Repozitář obsahuje první spustitelný TypeScript monorepo scaffold: Next.js web,
NestJS/Fastify API, worker, generované OpenAPI kontrakty, lokální PostgreSQL 18,
migraci a Keycloak realm. Produkční nasazení zatím nevzniklo. Směr je schválený
v ADR 0003 a níže uvedené příkazy jsou aktuální vývojový kontrakt.

Schválená topologie:

- repozitář `git@github.com:voldzi/Studio-Balance.git`;
- veřejná URL `https://studiobalance.zeleznalady.cz`;
- internetový Nginx reverse proxy na `dmz.home.cz`;
- produkční Docker kontejnery na `docker.home.cz`;
- produkční PostgreSQL 18 jen přes `haproxy.home.cz:5000`;
- produkční S3-kompatibilní úložiště médií na `docker.home.cz` přes vyhrazený
  Studio Balance bucket/gateway;
- Keycloak realm `studio-balance` na `docker.home.cz`, publikovaný jako
  `https://auth.studiobalance.zeleznalady.cz` přes Nginx na `dmz.home.cz`;
- lokální služby v Docker Desktop, bez produkčních dat a credentials.

Read-only inventura hostitele a readiness omezení jsou v
`docs/infrastructure-assessment.md`. Zjištěné 96% zaplnění root filesystému a
vyčerpaný swap blokují produkční rollout, dokud správce infrastruktury bezpečně
neuvolní nebo nerozšíří kapacitu a znovu ji neověří.

Základní ověření repozitáře:

```bash
pnpm check
```

## Prostředí

| Prostředí | Účel | Pravidla |
| --- | --- | --- |
| development | lokální vývoj v Docker Desktop | lokální PostgreSQL 18, projektový S3 tenant a Keycloak stejné hlavní verze s dev realm; syntetická data |
| test/staging | integrace, akceptace a restore test | oddělená DB/sender, produkčně podobná konfigurace |
| production | Nginx DMZ → Docker na `docker.home.cz` | DB přes `haproxy.home.cz:5000`, audit, alerty, backup |

Data ani secret se mezi prostředími nekopírují bez schváleného a bezpečného
postupu. Produkční osobní údaje se nepoužívají jako běžná testovací data.

## Konfigurace

`.env.example` a tato tabulka musí zůstat synchronizované. Prázdná hodnota
znamená, že konkrétní prostředí musí hodnotu dodat bezpečným kanálem.

| Název | Povinné | Výchozí | Secret | Účel |
| --- | --- | --- | --- | --- |
| `APP_ENV` | ano | `development` | ne | runtime prostředí |
| `APP_VERSION` | ano | `0.1.0` | ne | verze v health response a strukturovaných logách |
| `API_PORT` | ano | `3001` | ne | lokální port API |
| `PUBLIC_APP_URL` | ano | `http://localhost:3000` | ne | kanonická veřejná URL a odkazy |
| `ADMIN_APP_URL` | ano | `http://localhost:3000/admin` | ne | povolený admin origin a návratové URL |
| `API_URL` | ano | `http://localhost:3001` | ne | serverový endpoint sdíleného API |
| `DATABASE_URL` | runtime | lokální fixture na `localhost:5433/studio_balance` | ano | lokálně Docker PostgreSQL 18; produkčně host `haproxy.home.cz`, port `5000` |
| `S3_ENDPOINT` | production media runtime | prázdné | podle URL | interní S3-kompatibilní endpoint schválené Studio Balance gateway |
| `S3_REGION` | production media runtime | prázdné | ne | region očekávaný S3 klientem/službou |
| `S3_BUCKET` | production media runtime | prázdné | ne | vyhrazený Studio Balance bucket, ne bucket jiného projektu |
| `S3_ACCESS_KEY_ID` | production media runtime | prázdné | ano | identifikátor dedikovaných credentials |
| `S3_SECRET_ACCESS_KEY` | production media runtime | prázdné | ano | tajná část dedikovaných credentials |
| `S3_FORCE_PATH_STYLE` | ne | `true` | ne | kompatibilita s lokální a SeaweedFS S3 implementací |
| `OIDC_ISSUER_URL` | ano | `http://localhost:8081/realms/studio-balance` | ne | lokální Keycloak issuer; produkčně `https://auth.studiobalance.zeleznalady.cz/realms/studio-balance` |
| `OIDC_WEB_CLIENT_ID` | ano | `studiobalance-web` | ne | OIDC klient veřejné/klientské webové plochy |
| `OIDC_WEB_CLIENT_SECRET` | runtime | `local-web-client-only` | ano | veřejná lokální fixture; produkčně serverový secret webového OIDC klienta |
| `OIDC_ADMIN_CLIENT_ID` | ano | `studiobalance-admin` | ne | oddělený OIDC klient administrace |
| `OIDC_ADMIN_CLIENT_SECRET` | runtime | `local-admin-client-only` | ano | veřejná lokální fixture; produkčně serverový secret admin OIDC klienta |
| `SESSION_SECRET` | runtime | prázdné | ano | podpis/šifrování relace dle architektury |
| `EMAIL_FROM` | runtime | prázdné | ne | ověřený odesílatel transakčních zpráv |
| `EMAIL_PROVIDER_API_KEY` | runtime | prázdné | ano | e-mail provider credential |
| `LOG_LEVEL` | ne | `info` | ne | minimální úroveň logování |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | ne | prázdné | podle URL | cíl telemetrie |

Produkce nesmí startovat s vývojovým secretem, neplatnou veřejnou URL nebo
chybějící povinnou runtime závislostí. Konfigurační chyba má být konkrétní v
interním logu, ale nesmí vypsat hodnotu secretu.

## Externí závislosti

- PostgreSQL jako transakční zdroj pravdy;
- S3-kompatibilní úložiště produkčních binárních médií s odděleným tenantem;
- Keycloak/OIDC s realm `studio-balance`, oddělenými web/admin policies,
  email verification a admin MFA;
- Nginx reverse proxy na `dmz.home.cz` pro internetovou publikaci;
- transakční e-mail;
- observability/error monitoring;
- DNS/TLS a případně queue runtime.

S3 je schválené pro produkční media workflow, ale služba zatím není pro Studio
Balance připravená. Před použitím je nutné vytvořit vlastní
gateway/bucket/credentials,
připnout image, doplnit healthcheck, vyřešit kapacitu hostitele a prokázat
backup/restore. Keycloak vyžaduje healthcheck, zálohu realm/databáze, bezpečný
admin recovery a TLS issuer přes DMZ. PostgreSQL major je 18; otevřené jsou
databázové TLS/auth, Docker deployment, registry, Nginx upstream/TLS
konfigurace, poskytovatelé, ceny a limity. Žádná
platební služba není potřeba.

## Deployment kontrakt

Budoucí pipeline musí:

1. použít pinned/lockfile instalaci;
2. spustit lint, typecheck, testy, build, OpenAPI lint/diff a security scan;
3. vytvořit identifikovatelný immutable artefakt s verzí/commit SHA;
4. před nasazením ověřit zálohu a kompatibilitu migrace;
5. provést migraci bezpečným pořadím expand → deploy → contract;
6. nasadit Docker image API/worker/web na `docker.home.cz`, aktualizovat Nginx
   upstream na `dmz.home.cz` bezpečným postupem a ověřit `/health` a `/ready`;
7. ověřit Keycloak discovery/login/logout, email verification, klientskou relaci
   a admin MFA přes produkční issuer;
8. provést smoke kritické anonymní a autentizované cesty;
9. sledovat error rate, latency a notification queue;
10. ověřit zápis/čtení testovacího S3 objektu a stav zálohy bez
   zveřejnění originálu;
11. umožnit rollback aplikace bez ztráty nově zapsaných rezervací.

API změny se nasazují backward-compatible pořadím, aby web, API a worker mohly
být bezpečně rolloutovány a rollbackovány bez výpadku rezervací.

## Databázové migrace

- migrace jsou verzované a součástí repozitáře;
- lokální vývoj a CI používají PostgreSQL 18 v Docker Desktop;
- produkční migrace neběží z vývojářského notebooku bez kontrolovaného postupu;
- produkční connection konfigurace i migrace používají schválený HAProxy
  endpoint, ne přímý PostgreSQL node;
- destruktivní změna používá etapizaci a předchozí backup;
- dlouhé locky na tabulce rezervací se testují na realistickém objemu;
- rollback aplikace se neplete s automatickým down migration, která by mohla
  smazat data;
- změna statusu nebo peněžního snapshotu má migrační a auditní plán.

Produkční DB, vlastník a aplikační role se založí až podle skutečného schématu
verzovaným idempotentním skriptem. Skript použije `psql` přes
`haproxy.home.cz:5000`, admin heslo si vyžádá interaktivně bez echo, nepřijme je
v argumentu, nezapíše je do souboru/repozitáře a po chybě nezanechá napůl
vytvořená oprávnění. Přesný skript vznikne až po potvrzení názvů rolí, DB, TLS a
secret-store postupu.

## Health a readiness

- `GET /health`: 200, pokud proces běží; nekontroluje vzdálené služby;
- `GET /ready`: 200 jen pokud lze bezpečně obsloužit provoz; jinak 503;
- readiness minimálně zohlední DB a kritickou inicializaci. E-mail může
  degradovat asynchronně, pokud outbox bezpečně drží zprávy; přesné pravidlo se
  zafixuje implementací;
- S3 nedostupnost degraduje upload a media processing, ale nesmí zastavit
  čtení rozvrhu nebo rezervace; přesná media readiness politika se zafixuje
  implementací;
- response neobsahuje interní hostname ani credentials.

## Zálohování a obnova

Baseline:

- denní automatická záloha databáze;
- samostatná záloha/verzování S3 binárních objektů, monitoring stáří
  a prokázaná konzistentní obnova s PostgreSQL metadata;
- šifrování a přístup nejmenších oprávnění;
- monitoring stáří a úspěchu zálohy;
- pravidelná obnova do izolovaného test prostředí;
- ověření počtů/konzistence users, sessions, bookings, fees a auditů;
- dokumentovaný vlastník a evidence posledního restore testu.

RPO, RTO a retence nejsou schválené a musí se uzavřít před produkcí.

## Provozní limity

Před spuštěním se stanoví: maximální interval veřejného rozvrhu, velikost a
rozměry uploadu, page size/export limit, rate limits, počet opakování série,
timeouty a retry policy e-mailu a media processingu.
Limity jsou serverové a dokumentované v API; nesmí se objevit náhodně v UI.

## Rollback

Rollback musí vrátit předchozí aplikační artefakt a kompatibilní konfiguraci,
ne přepsat databázi starou zálohou. Restore databáze je samostatný incidentní
postup jen pro poškození/ztrátu dat. Po rollbacku se ověří health/readiness,
zápis testovací rezervace v bezpečném prostředí, queue/outbox a stav migrací.

## Vlastnictví a předání

Studio Balance musí vlastnit nebo mít plný přístup k doméně, DNS, Nginx DMZ,
Docker hostu, GitHub repozitáři, databázi, S3 bucketu/gateway, identitě,
e-mail senderu, analytice a monitoringu. Předání obsahuje
účet/službu, vlastníka, fakturaci,
rotaci credentials, náklady, export a postup ukončení služby.

## Vývojové příkazy

```text
install: pnpm install --frozen-lockfile
run web/api/worker: pnpm dev
run individually: pnpm dev:web | pnpm dev:api | pnpm dev:worker
build: pnpm build
test: pnpm test
lint: pnpm lint
typecheck: pnpm typecheck
database migrate: pnpm db:migrate
Docker Desktop Compose: pnpm infra:up | pnpm infra:down
Keycloak dev realm import: automatic during pnpm infra:up
OpenAPI validate/generate: pnpm validate:openapi | pnpm generate:contracts
all pre-merge checks: pnpm check
production database bootstrap: TBD (interactive; no committed password)
production Docker deploy to docker.home.cz: TBD
Keycloak realm/client provision: TBD
Nginx publish through dmz.home.cz: TBD
backup/restore test: TBD
S3 provision/backup/restore test: TBD
deploy/rollback: TBD
```

První lokální spuštění používá `cp .env.example .env`, `pnpm infra:up`,
`pnpm db:migrate` a `pnpm dev`. Compose credentials a OIDC client secrets jsou
záměrně veřejné lokální fixtures. Nesmějí být převzaty do produkce.

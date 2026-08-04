# Provoz a konfigurace

## Aktuální stav

Repozitář obsahuje první funkční zákaznické preview: Next.js web,
NestJS/Fastify API, worker, generované OpenAPI kontrakty, veřejný rozvrh,
klientský profil a transakční rezervaci/storno. Izolovaný starší náhled je
aktivní přes DMZ. Vedle něj běží ověřený produkční kandidát revize `d46b193`,
který používá skutečnou produkční DB přes HAProxy a produkční Keycloak, ale
zatím není směrován z veřejného Nginxu.
Směr je schválený v ADR 0003 a níže uvedené příkazy jsou aktuální vývojový
kontrakt.

Schválená topologie:

- repozitář `git@github.com:voldzi/Studio-Balance.git`;
- veřejná URL `https://studiobalance.zeleznalady.cz`;
- internetový Nginx reverse proxy na `dmz.home.cz`;
- produkční Docker kontejnery na `docker.home.cz`;
- produkční PostgreSQL 18 jen přes `haproxy.home.cz:5000`;
- produkční S3-kompatibilní úložiště médií na `docker.home.cz` přes vyhrazený
  Studio Balance bucket/gateway;
- Keycloak realm `studio-balance` na `docker.home.cz`, publikovaný jako
  `https://login.zeleznalady.cz` přes Nginx na `dmz.home.cz`;
- lokální služby v Docker Desktop, bez produkčních dat a credentials.

Read-only inventura hostitele a readiness omezení jsou v
`docs/infrastructure-assessment.md`. Disková kapacita byla před náhledovým
nasazením znovu ověřena; téměř vyčerpaný swap a neuzavřené produkční integrace
nadále blokují veřejný produkční rollout.

Zákaznické preview používá klientem dodané rastrové logo a fotografie. E-mail
je pro tuto etapu záměrně vypnutý; potvrzení se ukládá pouze jako interní zpráva
v účtu. S3 není pro tyto verzované statické preview assety potřeba a zůstává
vyhrazené pro budoucí administrativní media workflow.

## Izolovaný preview deployment

Náhled používá Compose projekt `studio-balance-preview`, web na interním host
portu 3280, API na 4280 a vlastní PostgreSQL 18 volume bez host portu. Neobsahuje
produkční data, S3, Keycloak ani HAProxy připojení a není publikovaný přes DMZ.

Nasazuje se pouze čistý commit dostupný v lokálním repozitáři:

```bash
pnpm deploy:preview -- <git-sha>
curl --fail http://docker.home.cz:4280/health
curl --fail http://docker.home.cz:4280/ready
curl --fail --head http://docker.home.cz:3280/
```

Nasazovací skript přenese přesný archiv commitu, sestaví image označené SHA,
spustí migraci a čeká na Compose dependency health. Náhodné databázové heslo je
uložené jen na hostiteli v
`/home/voldzi/deployments/studio-balance/.env.preview` s módem 0600. Hodnota se
nesmí vypisovat ani kopírovat do repozitáře.

Rollback na předchozí již sestavenou revizi:

```bash
pnpm rollback:preview -- <previous-git-sha>
```

Rollback znovu aktivuje starší aplikační image nad stejným preview volume a
nespouští down migration ani obnovu databáze. Před použitím se musí ověřit
zpětná kompatibilita migrací. Veřejná DMZ, produkční databáze, produkční
Keycloak a S3 mají vlastní pozdější change plan.

## Publikace preview přes DMZ

DNS A záznam `studiobalance.zeleznalady.cz` existuje. Nginx publikaci aktivuje
verzovaný skript z `infra/nginx/install-studiobalance.sh`:

```bash
sudo ./install-studiobalance.sh --activate-preview --email ADMIN_EMAIL
```

Po samostatném ověření produkčního kandidáta lze přepnout upstreamy na porty
3281/4281 pouze s přesnou očekávanou revizí:

```bash
sudo ./install-studiobalance.sh --activate-production \
  --expected-version GIT_SHA --email ADMIN_EMAIL
```

Preview režim proxyuje `/` na interní web port 3280 a `/api/` na API port 4280;
produkční režim používá 3281/4281 a ověřuje revizi z API readiness. Skript
technické health endpointy veřejně blokuje, získá Let's Encrypt certifikát,
ověří konfiguraci a při chybě obnoví předchozí site. Před spuštěním je nutné
nahradit `ADMIN_EMAIL` skutečným provozním kontaktem. Dokud správce skript
nespustí a neprojde externí HTTPS smoke test, nesmí se DMZ publikace označit
za aktivní.

### Stav aktivace 2026-08-04

Nginx publikace je aktivní pro interní preview revizi `e10a7ad`:

- `http://studiobalance.zeleznalady.cz` vrací 301 na HTTPS;
- `https://studiobalance.zeleznalady.cz` vrací web 200;
- certifikát Let's Encrypt pro tento hostname platí do 2026-11-02 a Certbot
  má aktivní plán obnovy;
- veřejné `/health` a `/ready` vracejí 404;
- Nginx proxyuje `/` na web 3280 a `/api/` na API 4280.

Jde stále o vývojový preview s izolovanou databází, nikoli o dokončené
produkční vydání. Produkční PostgreSQL je připraveno pro kandidátní Compose
stack; přihlášení Keycloak, S3 a e-mail zůstávají aplikačně nezapojené.

## Produkční kandidát (neveřejný)

Revize `d46b193` byla 2026-08-04 nasazena a ověřena: web 200, API health a
readiness 200 s odpovídající verzí, veřejný rozvrh čte produkční PostgreSQL a
OIDC login přesměruje na realm `studio-balance` s produkční callback URL.
DMZ přepnutí zůstává samostatný krok s omezeným sudo přístupem.

`docker-compose.production.yml` netvoří vlastní databázi. Spustí stejný obraz
aplikace proti `DATABASE_URL_MIGRATOR` pro migrace a následně proti
`DATABASE_URL` pro API; obě hodnoty jsou čtené výhradně z chráněného souboru
na Docker hostu. Kandidát používá interní host porty 3281 (web) a 4281 (API),
aby nemohl samovolně převzít stávající veřejný preview na portech 3280/4280.

```bash
pnpm deploy:production -- <git-sha>
curl --fail http://docker.home.cz:4281/ready
curl --fail --head http://docker.home.cz:3281/
```

Nasazení odmítne nepřítomný nebo příliš otevřený runtime soubor (vyžaduje
`0600`), nízkou diskovou/RAM rezervu a neúspěšný health check. Obrazy sestavuje
sériově, aby nezvyšovalo tlak na omezený swap hostitele. Nevypisuje konfigurační
hodnoty a nemění DMZ. Přepnutí veřejného Nginxu je samostatný change po ověření
autentizace, e-mailu, záloh a provozní readiness.

Pro dočasné udělení přístupu z lokální administrátorské stanice slouží
`scripts/grant-dmz-codex-access.sh`. Interaktivně využije existující SSH a sudo
uživatele, přenese ověřený bootstrap a ihned ověří nový oddělený přístup.
Bootstrap přidává samostatný omezený SSH klíč a sudo povoluje pouze pro rootem
vlastněný instalátor Nginx s ověřeným SHA-256; neuděluje obecné
`NOPASSWD: ALL`. Po dokončení se přístup odvolá volbou `--revoke`. Postup a
fingerprint jsou v `infra/nginx/README.md`.

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
| `OIDC_ISSUER_URL` | ano | `http://localhost:8081/realms/studio-balance` | ne | lokální Keycloak issuer; produkčně `https://login.zeleznalady.cz/realms/studio-balance` |
| `OIDC_WEB_CLIENT_ID` | ano | `studiobalance-web` | ne | OIDC klient veřejné/klientské webové plochy |
| `OIDC_WEB_CLIENT_SECRET` | runtime | `local-web-client-only` | ano | veřejná lokální fixture; produkčně serverový secret webového OIDC klienta |
| `OIDC_ADMIN_CLIENT_ID` | ano | `studiobalance-admin` | ne | oddělený OIDC klient administrace |
| `OIDC_ADMIN_CLIENT_SECRET` | runtime | `local-admin-client-only` | ano | veřejná lokální fixture; produkčně serverový secret admin OIDC klienta |
| `SESSION_SECRET` | ano pro identity runtime | lokální veřejná fixture | ano | podpis serverové HTTP-only relace; produkce vyžaduje unikátní hodnotu alespoň 32 znaků |
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

Přechodný bootstrap `scripts/bootstrap-production-postgres.sh` je připraven
pro `postgres@haproxy.home.cz:5000`. HAProxy při kontrole neposkytlo ověřitelný
TLS certifikát, proto skript používá pouze výslovně schválený dočasný
`sslmode=disable`. Node PostgreSQL ovladač neumí při neúspěšném TLS handshaku
bezpečně fallbacknout na prosté spojení; režim je proto explicitní, omezený na
interní trasu a nesmí být považován za konečnou produkční ochranu. Před veřejným
produkčním označením musí být nahrazen `verify-full` s vlastním CA. Vytváří databázi `studio_balance`, role `studio_balance_app` a
`studio_balance_migrator` a jednorázově vypíše aplikační secrety pro vložení do
secret store.

`scripts/bootstrap-production-keycloak.sh` používá stávající přísný public
hostname `login.zeleznalady.cz` a vytvoří vyhrazený realm `studio-balance` s
oddělenými confidential klienty. Tento hostname dočasně nahrazuje dosud
plánovaný `auth.studiobalance.zeleznalady.cz`; callbacky a web origins zůstávají
omezené na `https://studiobalance.zeleznalady.cz`.

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
production database bootstrap: scripts/bootstrap-production-postgres.sh
isolated preview deploy to docker.home.cz: pnpm deploy:preview -- <git-sha>
isolated preview rollback: pnpm rollback:preview -- <previous-git-sha>
production Docker candidate deploy to docker.home.cz: pnpm deploy:production -- <git-sha>
Keycloak realm/client provision: scripts/bootstrap-production-keycloak.sh
Nginx preview publish through dmz.home.cz: infra/nginx/install-studiobalance.sh
backup/restore test: TBD
S3 provision/backup/restore test: TBD
production deploy/rollback: TBD
```

První lokální spuštění používá `cp .env.example .env`, `pnpm infra:up`,
`pnpm db:migrate` a `pnpm dev`. Compose credentials a OIDC client secrets jsou
záměrně veřejné lokální fixtures. Nesmějí být převzaty do produkce.

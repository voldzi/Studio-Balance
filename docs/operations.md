# Provoz a konfigurace

## Aktuální stav

Repozitář obsahuje první funkční zákaznickou verzi: Next.js web,
NestJS/Fastify API, worker, generované OpenAPI kontrakty, veřejný rozvrh,
klientský profil, transakční rezervaci/storno a první administrační řez pro
rozvrh, lekce, klienty a rezervace. Revize `905647e` běží veřejně
přes DMZ, používá produkční PostgreSQL přes HAProxy a produkční Keycloak.
Izolovaný starší náhled zůstává oddělený na interních portech a není veřejným
zdrojem dat.
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
`docs/infrastructure-assessment.md`. Disková kapacita, readiness aplikace a
externí HTTPS smoke test byly před publikací ověřeny. S3 a e-mail zůstávají
vědomě mimo rozsah tohoto zákaznického preview.

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

## Publikace přes DMZ

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

### Stav aktivace 2026-08-05

Nginx publikace byla aktivována proti aplikační revizi `fb77662` a směruje na
produkční stack:

- `http://studiobalance.zeleznalady.cz` vrací 301 na HTTPS;
- `https://studiobalance.zeleznalady.cz` vrací web 200;
- certifikát Let's Encrypt pro tento hostname platí do 2026-11-02 a Certbot
  má aktivní plán obnovy;
- veřejné `/health` a `/ready` vracejí 404;
- Nginx proxyuje `/` na web 3281 a `/api/` na API 4281;
- před přepnutím skript ověřil API readiness s přesnou očekávanou revizí;
- externí smoke test potvrdil HTTPS web 200 a veřejný rozvrh 200.

Jde o zákaznickou první verzi. Produkční PostgreSQL a Keycloak jsou zapojené;
S3 a e-mail zůstávají mimo rozsah tohoto preview. Provozní audit 9. 8. 2026
před následujícím rolloutem ověřil běžící revizi `fd7b990`, zdravé web/API/worker
kontejnery a stejnou veřejnou DMZ trasu.

## Produkční verze

Výchozí produkční řez `fb77662` byl 2026-08-05 nasazen a ověřen. Aktuální
revize `905647e` byla 2026-08-09 nasazena s recenzním modulem, opravenou cache
obrázků a bezpečnějším deploy/rollback postupem. Web vrací 200, API health a
readiness odpovídají nasazené verzi, veřejný rozvrh čte produkční PostgreSQL,
klientský OIDC používá web klienta a `/admin` má samostatný admin OIDC klient,
HTTP-only relaci a serverovou kontrolu rolí.
DMZ přepnutí bylo 2026-08-05 provedeno omezeným sudo instalátorem; instalátor
uchoval zálohu předchozí konfigurace a validoval konfiguraci Nginxu.

### Ověření produkčního rezervačního toku 2026-08-05

Po hlášení, že se zadavatel po přihlášení nedostane do rezervace, byl
reprodukován chybný návrat na interní adresu `0.0.0.0:3000`. Příčinou bylo
sestavování cílové URL z interního originu Next.js requestu za reverse proxy.
Revize `fb77662` odvozuje všechny klientské i administrační návraty po OIDC a
odhlášení výhradně z nakonfigurované veřejné URL. Regresní testy ověřují, že se
interní origin do návratové adresy nedostane.

Po nasazení proběhl přes veřejnou HTTPS adresu skutečný end-to-end test:

- otevření budoucí lekce a vstup do rezervace;
- přihlášení produkčním klientským účtem a návrat na správnou veřejnou URL;
- doplnění profilu a souhlas s verzovanými storno podmínkami;
- vytvoření rezervace a její zobrazení v klientském účtu;
- včasné storno s výsledkem „Zrušeno včas“ a bez storno poplatku;
- odhlášení s návratem na veřejnou domovskou stránku.

Po testu nezůstala aktivní rezervace ani storno poplatek. Prohlížeč během toku
nezaznamenal konzolovou chybu a API readiness hlásilo verzi `fb77662`.

`docker-compose.production.yml` netvoří vlastní databázi. Spustí stejný obraz
aplikace proti `DATABASE_URL_MIGRATOR` pro migrace a následně proti
`DATABASE_URL` pro API; obě hodnoty jsou čtené výhradně z chráněného souboru
na Docker hostu. Kandidát používá interní host porty 3281 (web) a 4281 (API),
aby nemohl samovolně převzít stávající veřejný preview na portech 3280/4280.

```bash
pnpm deploy:production -- <git-sha>
pnpm rollback:production -- <previous-git-sha>
curl --fail http://docker.home.cz:4281/ready
curl --fail --head http://docker.home.cz:3281/
```

Nasazení odmítne nepřítomný nebo příliš otevřený runtime soubor (vyžaduje
`0600`), nízkou diskovou/RAM rezervu a neúspěšný health check. Obrazy sestavuje
sériově, aby nezvyšovalo tlak na omezený swap hostitele. Kandidát se nejprve
sestaví, po spuštění musí API readiness vrátit přesně požadovanou Git revizi a
web musí odpovědět 200. Deployment i rollback používají společný zámek proti
souběhu. Pokud kandidát nenaběhne, postup ověří dostupnost všech tří předchozích
image (API, web, worker), obnoví je a znovu čeká na readiness přesné předchozí
revize. Když se nepotvrdí ani rollback, skript skončí chybou a vyžaduje ruční
zásah; stav nesmí být označen za úspěšné nasazení. Nevypisuje konfigurační
hodnoty a nemění DMZ.

Webový runtime vytváří zapisovatelný pouze adresář `.next/cache` pro uživatele
`node`; zbytek aplikačního stromu zůstává pouze pro čtení. Po rollout se dvakrát
vyžádá stejná optimalizovaná fotografie a v logu se ověří, že nevzniká `EACCES`
ani `unhandledRejection` z image cache.

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
  jednoduchou klientskou registrací bez e-mailového ověření a povinným admin MFA;
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

Schválené obrazové podklady aktuálního preview jsou součástí webového balíčku
na cestě `/images/studio-balance/`; nejsou vydávány za finální originální
fotografie studia. Po připravení vyhrazeného S3 bucketu se nahradí řízeným
importem a adresy médií se přepnou v administraci.

Administrační modul proměn je připravený na vyhrazené S3 úložiště. Dokud nejsou
společně nastavené `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` a
`S3_SECRET_ACCESS_KEY`, seznam a koncepty fungují, ale upload vrací řízené
`MEDIA_STORAGE_UNAVAILABLE` (HTTP 503). Nesmí se použít bucket ani credentials
jiné aplikace běžící na `docker.home.cz`.

E-mailové úlohy vznikají v tabulce `notification_outbox`, ale bez schváleného
poskytovatele, odesílací adresy a retenční politiky nejsou odesílány ani
označovány jako odeslané. Klientská potvrzení jsou mezitím dostupná v účtu.

## Deployment kontrakt

Budoucí pipeline musí:

1. použít pinned/lockfile instalaci;
2. spustit lint, typecheck, testy, build, OpenAPI lint/diff a security scan;
3. vytvořit identifikovatelný immutable artefakt s verzí/commit SHA;
4. před nasazením ověřit zálohu a kompatibilitu migrace;
5. provést migraci bezpečným pořadím expand → deploy → contract;
6. nasadit Docker image API/worker/web na `docker.home.cz`, aktualizovat Nginx
   upstream na `dmz.home.cz` bezpečným postupem a ověřit `/health` a `/ready`;
7. ověřit Keycloak discovery/login/logout, klientskou registraci bez e-mailové
   povinné akce, klientskou relaci a admin MFA přes produkční issuer;
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

Vlastní login theme je verzovaný v
`infra/keycloak/themes/studio-balance/`. Lokální Keycloak jej připojuje pouze
pro čtení a importovaný realm používá češtinu jako výchozí jazyk. Produkční
nasazení provádí interaktivní
`scripts/deploy-production-keycloak-theme.sh`: heslo master administrátora si
vyžádá bez echo a neukládá je, předchozí theme zazálohuje, restartuje pouze
sdílený Keycloak kontejner, čeká na health, aktivuje theme jen v realm
`studio-balance` a ověří veřejné načtení stylesheetu. Ostatní realmy ani jejich
login theme nemění.

Theme byl do produkčního realm `studio-balance` aktivován 5. 8. 2026 z revize
`5c69ad4`. Veřejný login na `login.zeleznalady.cz` byl po nasazení ověřen ve
výchozím desktopovém rozměru i na šířce 360 px: česká lokalizace, brandovaný
stylesheet a rozvržení bez vodorovného posuvu. Produkční ověření nezahrnuje
zadání přihlašovacích údajů ani změnu MFA uživatele.

### Jmenovitý účet administrátorky

`scripts/provision-production-admin.sh` se spouští až po potvrzení přesného
e-mailu provozovatelky. Interaktivně načte Keycloak master heslo bez echo,
vytvoří nebo po výslovném potvrzení aktualizuje jmenovitý účet, přiřadí pouze
realm roli `admin`, nastaví jednorázové dočasné heslo a required action
`CONFIGURE_TOTP`. Při opravě účtu lze po samostatném potvrzení odstranit jeho
staré TOTP credentials a vynutit nové spárování ověřovací aplikace. Dočasné
heslo lze zadat skrytě dvakrát; skript je pak nevypíše ani neuloží. Pokud je
pole prázdné, vygeneruje náhodné heslo a vypíše je právě jednou. Na konci ověří
aktivní účet a realm roli `admin`.

Samostatná admin OIDC žádost navíc používá `prompt=login` a `max_age=0`.
Přechod z již přihlášeného klientského profilu s podepsanou rolí `admin` nebo
`super_admin` ale samostatnou žádost nespouští a správu otevře automaticky.
Před předáním se dokončí první login, změna dočasného hesla a registrace TOTP;
následně se v druhé anonymní relaci ověří, že přihlášení vyžaduje heslo i OTP a
že klientský účet bez role končí na srozumitelné chybě. Dokud tento test
neproběhne pro potvrzený jmenovitý účet, administrátorský přístup není předaný.

### Jednoduchá registrace a povinné OTP administrace

`scripts/configure-production-keycloak-auth.sh` bezpečně nastaví produkční
realm `studio-balance` bez e-mailového ověřování klienta a bez odkazu na reset
hesla, dokud studio nemá nakonfigurovaný SMTP sender. Současně vytvoří nebo
opraví oddělený browser flow klienta `studiobalance-admin`; obsahuje povinný
formulář hesla i povinný TOTP formulář. Klientský OIDC flow zůstává beze změny.

Skript se spouští z lokálního Macu a interaktivně si vyžádá pouze master
Keycloak jméno a heslo. Po úspěchu ověří, že e-mailové ověřování i reset hesla
jsou vypnuté, odstraní z existujících účtů pouze starou required action
`VERIFY_EMAIL` (ostatní akce včetně `UPDATE_PASSWORD` a `CONFIGURE_TOTP`
zachová) a ověří, že je administrátorský flow skutečně navázaný na klienta.
Současně zapne a kontroluje předávání realm rolí v podepsaném ID tokenu.
Samotné přiřazení role uživateli v Keycloaku nestačí: bez tohoto mapperu by
web ani oddělená administrace role `admin` a `super_admin` nerozpoznaly.
Následné ověření se provede v anonymním okně: klientská registrace musí projít
bez e-mailové zprávy; administrátorský vstup po heslu vždy vyžádá TOTP.

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

```bash
pnpm rollback:production -- <previous-git-sha>
```

Vzdálený wrapper ověří, že cílový release obsahuje produkční Compose soubor,
bezpečně nahraje aktuální management rollback skript a na Docker hostu ověří
existenci všech tří cílových image. Rollback používá `--no-build`, neprovádí
databázový down migration a přijme výsledek jen tehdy, když readiness vrátí
přesnou cílovou revizi a web odpoví 200. Předchozí image se proto nemažou,
dokud neuplyne schválené rollback okno. Migrace každého release musí být po
tuto dobu zpětně kompatibilní; jinak je rollback aplikace zakázán a řeší se
samostatným incidentním postupem.

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
production Docker rollback on docker.home.cz: pnpm rollback:production -- <previous-git-sha>
Keycloak realm/client provision: scripts/bootstrap-production-keycloak.sh
Keycloak production preview accounts: scripts/provision-production-preview-accounts.sh
Keycloak production admin with mandatory MFA enrollment: scripts/provision-production-admin.sh
Nginx preview publish through dmz.home.cz: infra/nginx/install-studiobalance.sh
backup/restore test: TBD
S3 provision/backup/restore test: TBD
production deploy/rollback: infra/scripts/deploy-production.sh | infra/scripts/rollback-production.sh
```

První lokální spuštění používá `cp .env.example .env`, `pnpm infra:up`,
`pnpm db:migrate` a `pnpm dev`. Compose credentials a OIDC client secrets jsou
záměrně veřejné lokální fixtures. Nesmějí být převzaty do produkce.

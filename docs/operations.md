# Provoz a konfigurace

## Aktuální stav

Repozitář obsahuje první funkční zákaznickou verzi: Next.js web,
NestJS/Fastify API, worker, generované OpenAPI kontrakty, veřejný rozvrh,
klientský profil, transakční rezervaci/storno a první administrační řez pro
rozvrh, lekce, klienty a rezervace. Aplikace běží veřejně přes DMZ, používá
produkční PostgreSQL přes HAProxy a produkční Keycloak. Přesnou běžící revizi
vrací readiness endpoint; před změnou CD-044/CD-045 byla ověřena `e85bf88`.
Izolovaný starší náhled zůstává oddělený na interních portech a není veřejným
zdrojem dat.
Směr je schválený v ADR 0003 a níže uvedené příkazy jsou aktuální vývojový
kontrakt.

Schválená topologie:

- repozitář `git@github.com:voldzi/Studio-Balance.git`;
- kanonická veřejná URL `https://studio-balance.cz`;
- internetový Nginx reverse proxy na `dmz.home.cz`;
- produkční Docker kontejnery na `docker.home.cz`;
- produkční PostgreSQL 18 jen přes `haproxy.home.cz:5000`;
- produkční SeaweedFS na `storage.home.cz:8333`, bucket `studio-balance-media`;
- Keycloak realm `studio-balance` na `docker.home.cz`, publikovaný jako
  `https://login.studio-balance.cz` přes Nginx na `dmz.home.cz`;
- lokální služby v Docker Desktop, bez produkčních dat a credentials.

Read-only inventura hostitele a readiness omezení jsou v
`docs/infrastructure-assessment.md`. Disková kapacita, readiness aplikace a
externí HTTPS smoke test byly před publikací ověřeny. S3 je od 5. 9. 2026
připojené dle ADR 0012; e-mailové odesílání zůstává vypnuté.

Zákaznické preview používá klientem dodané rastrové logo a fotografie. E-mail
je pro tuto etapu záměrně vypnutý; potvrzení se ukládá pouze jako interní zpráva
v účtu. Dodané statické assety dále fungují; nové uploady v administraci již
používají vlastní S3 bucket.

## Izolovaný preview deployment

Náhled používá na `devapps.home.cz` Compose projekt `studio-balance-preview`, web na
lokálním host portu 3280, API na 4280 a vlastní PostgreSQL 18 volume bez host portu.
Porty se vážou pouze na `127.0.0.1`; preview je vypnuté mimo dobu výslovného testování.
Neobsahuje
produkční data, S3, Keycloak ani HAProxy připojení a není publikovaný přes DMZ.

Nasazuje se pouze čistý commit dostupný v lokálním repozitáři:

```bash
pnpm deploy:preview -- <git-sha>
ssh -i ~/.ssh/id_ed25519_intranet_codex voldzi@devapps.home.cz 'curl --fail http://127.0.0.1:4280/health'
ssh -i ~/.ssh/id_ed25519_intranet_codex voldzi@devapps.home.cz 'curl --fail http://127.0.0.1:4280/ready'
ssh -i ~/.ssh/id_ed25519_intranet_codex voldzi@devapps.home.cz 'curl --fail --head http://127.0.0.1:3280/'
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

DNS záznamy `studio-balance.cz`, `www.studio-balance.cz` a
`login.studio-balance.cz` musí směřovat na IPv4 DMZ. Nefunkční AAAA se před
aktivací odstraní. Nginx publikaci aktivuje
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
ověří konfiguraci, přesměruje `www` na kanonickou adresu a při chybě obnoví
předchozí site. Před spuštěním je nutné
nahradit `ADMIN_EMAIL` skutečným provozním kontaktem. Dokud správce skript
nespustí a neprojde externí HTTPS smoke test, nesmí se DMZ publikace označit
za aktivní.

### Přechod na vlastní doménu

Přesun podle ADR 0011 probíhá bez změny účtů a rezervačních dat:

1. Ve WEDOS DNS se root, `www` a `login` nastaví na IPv4 DMZ; výchozí
   parking AAAA se odstraní, protože DMZ zatím nemá ověřenou veřejnou IPv6.
2. Omezený DMZ instalátor se obnoví přes
   `scripts/grant-dmz-codex-access.sh` a spustí se s
   `--activate-production`, přesnou revizí a ACME kontaktem.
3. `scripts/configure-production-domain.sh` nastaví nový realm frontend a
   callback originy pouze pro vlastní doménu; správcovské skripty následně
   používají rovněž `login.studio-balance.cz`.
4. V produkčním secret souboru se společně nastaví
   `PUBLIC_APP_URL=https://studio-balance.cz`,
   `ADMIN_APP_URL=https://studio-balance.cz/admin` a
   `OIDC_ISSUER_URL=https://login.studio-balance.cz/realms/studio-balance`;
   poté se znovu nasadí přesná revize.
5. Po anonymním ověření webu, registrace, klientského loginu, administrátorského
   MFA, rezervace a storna se ověří 301 z `www`, sitemap, robots a kanonická
   metadata. Teprve potom se nový hostname předá Google Search
   Console a do nových QR kódů.
6. Google Search Console, Bing Webmaster Tools a firemní profil na Seznamu
   používají výhradně kanonickou adresu `https://studio-balance.cz`. Do obou
   webmaster nástrojů se odešle `https://studio-balance.cz/sitemap.xml`.
   Bing a další podporované vyhledávače lze po obsahové změně upozornit pomocí
   `PUBLIC_APP_URL=https://studio-balance.cz bash scripts/submit-indexnow.sh`;
   veřejný ověřovací klíč je uložený ve webovém `public/` a není tajemstvím.

Veřejné stránky publikují vlastní canonical, Open Graph a Twitter metadata.
Domovská stránka navíc publikuje strukturovaná data `WebSite` a
`SportsActivityLocation` s adresou studia. Sitemap obsahuje všechny veřejné
obsahové stránky a aktivní typy lekcí z produkčního API. Účet, přihlášení,
rezervační kroky, administrace a technické endpointy se neindexují. Pravidla
robots výslovně dovolují Googlebot, Bingbot, SeznamBot, OAI-SearchBot,
ChatGPT-User, Claude-SearchBot a Claude-User, ale zachovávají stejná omezení
privátních cest jako obecné pravidlo.

Rollback vrátí produkční URL v secret souboru a předchozí Nginx zálohu;
databáze se nemění.

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
sériově, aby nezvyšovalo tlak na omezený swap hostitele. Při předem sestavených
obrazech pro `linux/amd64` lze použít `STUDIO_BALANCE_PREBUILT_IMAGES=1
pnpm deploy:production -- <git-sha>`; skript před spuštěním ověří, že všechny
tři verzované obrazy na hostiteli existují a mají správnou architekturu.
Paměťový a diskový limit, kontrola prostředí, health check i rollback platí
stejně. Po spuštění musí API readiness vrátit přesně požadovanou Git revizi a
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
| `PUBLIC_APP_URL` | ano | `http://localhost:3000` | ne | kanonická veřejná URL a odkazy; stejná hodnota v API pro přesnou kontrolu originu recenzí |
| `ADMIN_APP_URL` | ano | `http://localhost:3000/admin` | ne | povolený admin origin a návratové URL |
| `API_URL` | ano | `http://localhost:3001` | ne | serverový endpoint sdíleného API |
| `DATABASE_URL` | runtime | lokální fixture na `localhost:5433/studio_balance` | ano | lokálně Docker PostgreSQL 18; produkčně host `haproxy.home.cz`, port `5000` |
| `S3_ENDPOINT` | production media runtime | prázdné | podle URL | interní S3-kompatibilní endpoint schválené Studio Balance gateway |
| `S3_REGION` | production media runtime | prázdné | ne | region očekávaný S3 klientem/službou |
| `S3_BUCKET` | production media runtime | prázdné | ne | vyhrazený Studio Balance bucket, ne bucket jiného projektu |
| `S3_ACCESS_KEY_ID` | production media runtime | prázdné | ano | identifikátor dedikovaných credentials |
| `S3_SECRET_ACCESS_KEY` | production media runtime | prázdné | ano | tajná část dedikovaných credentials |
| `S3_FORCE_PATH_STYLE` | ne | `true` | ne | kompatibilita s lokální a SeaweedFS S3 implementací |
| `OIDC_ISSUER_URL` | ano | `http://localhost:8081/realms/studio-balance` | ne | lokální Keycloak issuer; produkčně `https://login.studio-balance.cz/realms/studio-balance` |
| `OIDC_BACKCHANNEL_ISSUER_URL` | ne | prázdné | ne | produkční interní cesta z webového i API kontejneru do Keycloaku; produkčně `http://keycloak:8081/realms/studio-balance`, veřejný issuer a přihlašovací obrazovka zůstávají `https://login.studio-balance.cz` |
| `OIDC_WEB_CLIENT_ID` | ano | `studiobalance-web` | ne | OIDC klient veřejné/klientské webové plochy |
| `OIDC_WEB_CLIENT_SECRET` | runtime | `local-web-client-only` | ano | veřejná lokální fixture; produkčně serverový secret webového OIDC klienta |
| `OIDC_ADMIN_CLIENT_ID` | ano | `studiobalance-admin` | ne | oddělený OIDC klient administrace |
| `OIDC_ADMIN_CLIENT_SECRET` | runtime | `local-admin-client-only` | ano | veřejná lokální fixture; produkčně serverový secret admin OIDC klienta |
| `SESSION_SECRET` | ano pro identity runtime | lokální veřejná fixture | ano | HMAC interní BFF/API relace a HKDF vstup pro AES-256-GCM šifrování refresh tokenů; produkce vyžaduje unikátní hodnotu alespoň 32 znaků |
| `EMAIL_FROM` | runtime | prázdné | ne | ověřený odesílatel transakčních zpráv |
| `EMAIL_PROVIDER_API_KEY` | runtime | prázdné | ano | e-mail provider credential |
| `LOG_LEVEL` | ne | `info` | ne | minimální úroveň logování |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | ne | prázdné | podle URL | cíl telemetrie |

Produkce nesmí startovat s vývojovým secretem, neplatnou veřejnou URL nebo
chybějící povinnou runtime závislostí. Konfigurační chyba má být konkrétní v
interním logu, ale nesmí vypsat hodnotu secretu.

## Externí závislosti

Obnova hesla v Keycloaku má samostatnou SMTP konfiguraci podle ADR 0031.
`EMAIL_FROM` a `EMAIL_PROVIDER_API_KEY` v tabulce výše jsou určeny pro dosud
neaktivované rezervační notifikace; jejich přítomnost nezajišťuje reset hesla.

- PostgreSQL jako transakční zdroj pravdy;
- S3-kompatibilní úložiště produkčních binárních médií s odděleným tenantem;
- Keycloak/OIDC s realm `studio-balance`, oddělenými web/admin policies,
  jednoduchou klientskou registrací bez e-mailového ověření a povinným admin MFA;
- Nginx reverse proxy na `dmz.home.cz` pro internetovou publikaci;
- transakční e-mail;
- observability/error monitoring;
- DNS/TLS a případně queue runtime.

S3 media workflow je připojené k existujícímu SeaweedFS 4.29 na
`storage.home.cz:8333`. Vlastní bucket, účty, verzování a test obnovy
popisuje ADR 0012 a provozní postup níže. Keycloak vyžaduje healthcheck, zálohu realm/databáze, bezpečný
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
- migrace `0019_unified_barre_schedule.sql` před změnou zamkne rozvrh a
  rezervační outbox, odmítne neočekávaný budoucí termín nebo časovou kolizi a
  teprve poté atomicky převede budoucí ranní Barre na středu 8:00;
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

`scripts/bootstrap-production-keycloak.sh` vytvoří vyhrazený realm
`studio-balance` s oddělenými confidential klienty. Veřejný frontend realmu
je `https://login.studio-balance.cz` a callbacky i web origins jsou omezené na
`https://studio-balance.cz`. Sdílený master-admin hostname Keycloaku není
aplikačním issuerem Studio Balance.

Vlastní login theme je verzovaný v
`infra/keycloak/themes/studio-balance/`. Lokální Keycloak jej připojuje pouze
pro čtení a importovaný realm používá češtinu jako výchozí jazyk. Produkční
publikace od CD-073 používá novou verzovanou složku v existujícím mountu,
ověření kopie a změnu pouze `loginTheme` vyhrazeného realmu existujícím
operations klientem. Původní vazba tématu se uloží na ověřené X5 pro rollback;
sdílený Keycloak se nerestartuje. Postup je níže v části Obnova hesla a ochrana
přihlášení. Staré `scripts/deploy-production-keycloak-theme.sh` a
`infra/keycloak/install-studio-balance-theme.sh` jsou vyřazené: skončí kódem
64 před čtením credentials nebo změnami a nesmí přepsat aktivní téma.

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

Jmenovitý účet nejprve dokončí změnu dočasného hesla a registraci TOTP. Při
běžném přihlášení do aplikace pak zadá heslo a TOTP jednou; podepsaný AMR důkaz
se uloží do neprůhledné `sb_session` a vstup ze správy profilu otevře
administraci automaticky. Samostatná admin OIDC žádost s `prompt=login` a
`max_age=0` zůstává záložní cestou a po heslu a TOTP vytvoří
`sb_admin_session`. Obě MFA-prokázané relace mohou být na zapamatovaném zařízení
platné nejvýše 90 dní při aktivitě aspoň jednou za 30 dní. Role admin bez
uloženého důkazu OTP nestačí. Před předáním se v nové anonymní relaci ověří
heslo, OTP, automatický přechod z profilu i zákaz klientského účtu bez role.

### Jednoduchá registrace a povinné OTP administrace

`scripts/configure-production-keycloak-auth.sh` bezpečně nastaví produkční
realm `studio-balance` bez e-mailového ověřování klienta. Již nastavenou
obnovu hesla zachová; její samostatná aktivace vyžaduje ověřené SMTP podle
ADR 0031 a postupu níže. `studiobalance-web`
použije standardní Keycloak browser flow: běžný účet bez OTP zadá heslo, účet
administrátora s nakonfigurovaným OTP dokončí také ověřovací kód.
`studiobalance-admin` si ponechá vlastní flow s povinným heslem a TOTP jako
záložní vstup.

Skript se spouští z lokálního Macu a interaktivně si vyžádá pouze master
Keycloak jméno a heslo. Po úspěchu ověří, že e-mailové ověřování
je vypnuté, odstraní z existujících účtů pouze starou required action
`VERIFY_EMAIL` (ostatní akce včetně `UPDATE_PASSWORD` a `CONFIGURE_TOTP`
zachová) a ověří, že jsou standardní webový i povinný administrátorský flow
navázané na správné klienty. Současně zapne a kontroluje předávání realm rolí
i standardního AMR důkazu v podepsaném ID tokenu.
Samotné přiřazení role uživateli v Keycloaku nestačí: bez tohoto mapperu by
web ani oddělená administrace role `admin` a `super_admin` nerozpoznaly.
AMR mapper sám o sobě také nestačí. Skript nastaví na úspěšných password a OTP
executions explicitní autentizační reference `pwd` a `otp` ve standardním
webovém `forms` flow i v odděleném admin flow a jejich hodnoty po zápisu znovu
ověří. Bez těchto referencí by uživatel mohl heslo i TOTP správně dokončit, ale
podepsaný token by neobsahoval `amr: ["otp"]` a administrace by jej znovu
vrátila na přihlášení.
Skript vypne Keycloak checkbox „Zapamatovat si mě“ a nastaví SSO i client
session na 30 dní neaktivity / 90 dní maximum; jedinou uživatelskou volbu
zapamatování pak zobrazuje aplikace. Následné ověření se provede v anonymním
okně: klientská registrace musí projít bez e-mailové zprávy; běžný klient
dokončí heslo a administrátorský účet heslo i TOTP. Po přihlášení
administrátora se `/admin` otevře bez druhého formuláře. V aplikaci cookie bez volby
zapamatování končí se zavřením prohlížeče; zapamatovaná klientská i MFA-prokázaná
admin relace má maximum 90 dní a 30denní neaktivní limit. Server nejpozději po
15 minutách ověřuje účet a role znovu v Keycloaku; odhlášení zruší relace,
refresh tokeny i oba cookies na daném zařízení.
Změna AMR konfigurace zpětně nepovýší již existující webové relace. Po jejím
nasazení musí administrátor jednou projít novým interaktivním přihlášením s
heslem a TOTP; nově vydaná relace pak může správu otevírat bez dalšího formuláře.

### Odolnost přihlášení a společný release web/API

Interní BFF/API session podpis v2 chrání přesné tělo, náhodné nonce, čas,
metodu a cestu podle [bezpečnostního protokolu](security.md#interní-bffapi-protokol-a-návratové-url).
Starý podpis není přijímán. Web a API se nasazují i vracejí společně ze stejné
revize; smíšený release může dočasně odmítat session requesty a není provozně
kompatibilní. API startuje s `rawBody: true`. Nginx nevystavuje `/api/internal/`
veřejnosti; web používá soukromý `API_URL`. Změna podpisu ani cache resolverů
nevyžaduje změnu `SESSION_SECRET` a sama existující relace neruší.

Při výpadku token/JWKS endpointu nebo timeoutu zastaralá relace vrátí 503
`IDENTITY_PROVIDER_UNAVAILABLE`, zůstane uložená a login zobrazí dočasnou
nedostupnost místo nového hesla/OTP. Po návratu identity se ověření opakuje;
neověřená identita ani role se mezitím nepoužijí. Pokud Keycloak otočil refresh
token ještě před výpadkem JWKS, server uloží jen jeho šifrovanou náhradu.
`invalid_grant`, definitivně neplatný JWT, změna subjektu nebo odebraná admin
role vyžadují novou relaci. Výpadek neprodlužuje 90denní maximum, 30denní
neaktivitu ani patnáctiminutový interval ověření.

Identity fetch a JWKS fetch mají každý limit 8 sekund; při obnově může jeden
request postupně čekat na oba. Aplikační pool proto nastavuje
`idle_in_transaction_session_timeout=30000` ms jako explicitní parametr
spojení, aby přísnější role default neukončil zámek během běžné obnovy.
Platnost se ověří `SHOW idle_in_transaction_session_timeout` na aplikačním
spojení, nikoli pouze na odlišném administrátorském spojení. Migrace nepřebírají
nový plošný statement/query timeout. Pokud provozní timeout nebo proxy limit
zkrátí tuto dobu, musí release zachovat konzistentní rotaci refresh tokenu;
nekopírovat tokeny do logu ani ručně neobnovovat starý credential.

Procesová replay cache přijme nejvýše 10 000 platně podepsaných nonce a
časové okno ±60 sekund; nonce žije do podepsaného času +60 sekund. API používá
jeden JWKS resolver, web má nejvýše osm resolverů. Čerstvé session se dotýkají
aktivity nejvýše jednou za pět minut; nejvýše 50 různých zastaralých session
se obnovuje současně a souběžné requesty stejné session sdílejí ověření.
Současný provoz počítá s jednou API instancí. Před škálováním na více instancí
je nutné atomické sdílené úložiště nonce; procesová cache nepřežije restart.

Před předáním ověřit klientský login, admin login s povinným prvním OTP,
opakované otevření zapamatovaného zařízení, konec/odhlášení relace, zakázaný
externí návrat, odmítnutí opakovaného interního podpisu a privátní cache headers.
Řízené testy timeoutu, provider 503, JWT chyb a rotace běží pouze proti
syntetickému identity serveru. Výpadek produkčního Keycloaku se nevyvolává
kvůli ověření aplikace. Lokální test není potvrzení 90denní fyzické-device
akceptace.

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
S3 provision/backup/restore: scripts/provision-media-storage.py, scripts/media-backup.mjs; viz ADR 0012
production deploy/rollback: infra/scripts/deploy-production.sh | infra/scripts/rollback-production.sh
```

První lokální spuštění používá `cp .env.example .env`, `pnpm infra:up`,
`pnpm db:migrate` a `pnpm dev`. Compose credentials a OIDC client secrets jsou
záměrně veřejné lokální fixtures. Nesmějí být převzaty do produkce.

## Vydání portrétů a středečního Barre (2026-09-05)

Migrace 0016 přidá portréty, katalogové vazby instruktorů a týmovou sekci.
Dodané fotografie mají verzované WebP deriváty v
`apps/web/public/images/studio-balance/team/`; původ, rozměry a SHA-256 jsou
v `infra/media/studio-team.json`. Současné zákaznické preview pokračuje ve
stávajícím režimu statických assetů. Nahrávání náhradních fotografií používá
vyhrazené S3 a bez jeho konfigurace vrací srozumitelnou 503; nelze použít
cizí bucket nebo credentials. Fotografie se přiřazují v Lekce a lektoři,
tým ve stejné sekci níže.

Před aplikací 0017 zkontrolovat budoucí Barre Strength, rezervace a středeční
kolize. Migrace se atomicky zastaví při kolizi nebo právě zpracovávaném
upozornění. Změna má účinnost 9. 9. 2026 8:30 Europe/Prague. Přesune existující
standardní termíny a doplní chybějící středy v 30denním horizontu od spuštění;
nezavádí automatické prodlužování rozvrhu. Další týdny nadále spravuje studio.
Individuálně upravené a zrušené termíny zůstávají k samostatnému posouzení.
U přesunutých rezervací je zpráva v účtu a e-mail v outboxu, nikoli tvrzení o
doručení: aktuální worker e-maily neodesílá. Provozní informování řeší studio.
Rollback aplikace automaticky nevrací termíny na čtvrtek; případná náprava dat
musí respektovat nové rezervace a audit `session.rescheduled`.

### Potvrzený rozvrh od 29. 9. 2026 (CD-052)

Dne 25. 9. 2026 bylo po kontrolním výpočtu atomicky vypsáno 35 termínů od
29. 9. do 28. 10. včetně: 9 TRX, 9 Jumping, 9 kruhových tréninků a 8 Power Yoga.
Podkladem byl zadavatelkou potvrzený týdenní rozvrh v `docs/client-decisions.md`.
Barre a Balance Flow se nevypsaly; již zrušené Barre 30. 9. zůstalo beze změny.
Zápisy mají auditní `request_id=confirmed-schedule-2026-09-25`. Kontrolní výpočet
ověřil aktivní typy a lektory, hodinovou délku i kolize. Šest vzdálenějších
termínů se začne rezervovat až 30 dní před začátkem podle `booking_opens_at`.
Tento jednorázový zápis nezajišťuje automatické prodlužování rozvrhu za
28. 10.; před vyčerpáním horizontu je nutné rozhodnout o provozním postupu pro
další týdny. Případná náprava musí respektovat mezitím vzniklé rezervace a audit.

Dne 25. 9. zadavatelka poslala finální verzi rozvrhu (CD-053). Čtyři pondělní
termíny TRX z tohoto horizontu se opravují z 16:45 na 17:00 při zachování ID,
rezervačního okna a auditní stopy. Před změnou neměly žádné rezervace. Ostatní
vypsané termíny již odpovídaly finální verzi.

Dne 25. 9. zadavatel výslovně otevřel také Barre a Balance Flow (CD-054).
Po snapshotu a kontrolním výpočtu bylo v jedné transakci doplněno 17 termínů
a obnoveno již existující, dosud neobsazené Barre 30. 9. v 8:00. Celý veřejný
horizont 29. 9.–28. 10. nyní obsahuje 53 termínů: 10 Barre, 8 Balance Flow
a 35 dříve vypsaných ostatních lekcí. Auditní request ID je
`open-barre-flow-2026-09-25`. Ze studiového oznámení byla odebrána neaktuální
zmínka o odkladu Barre a Balance Flow. Veřejné API ověřilo všech 53 termínů,
časy a lektorky nových lekcí, žádnou sobotu, otevřený provoz a rezervovatelné
bližší termíny. Vzdálenější termíny se zpřístupní podle standardního
30denního rezervačního okna. Ani tento zápis automaticky nevytváří další
termíny za 28. 10.; navazující rozvrh vyžaduje samostatné vypsání.

## Připojené úložiště a zálohy (CD-046, 2026-09-05)

Runtime API používá `http://storage.home.cz:8333`, region `us-east-1`,
`S3_FORCE_PATH_STYLE=true` a bucket `studio-balance-media`. SeaweedFS 4.29 má
verzování bucketu Enabled. Nevyžaduje se nová služba na Docker hostiteli.
Endpoint je ze serveru aplikace dostupný; přímý přístup z vývojového počítače
může být síťově omezený. Nové fotografie proměn, instruktorů a týmu se
nahrávají do tohoto bucketu. Dodané statické obrázky dál fungují jako výchozí
obsah, dokud je administrátor nevymění.

Provisioning: `scripts/provision-media-storage.py` spustit přes SSH se sudo
na `storage.home.cz` (SSH účet `voldzi`, klíč `~/.ssh/id_ed25519_intranet_codex`). Skript očekává existující infrastrukturu a nikdy
nepřebírá neznámý existující bucket ani účet. Zálohu konfigurace, vlastní
identities a exporty 0600 ukládá pod `/srv/seaweedfs/studio-balance/` (0700).
Statický bind-mountovaný soubor přepisuje při zachování inode a následně
načte pomocí HUP. Opakované spuštění zachovává klíče a ověřuje jejich rozsah.

Přenášet výhradně vlastní exporty `studio-balance-app.env` a
`studio-balance-backup.env` přes SSH do provozního adresáře na Docker hostiteli,
nikdy celý sdílený S3 konfigurační soubor. Runtime export je
`.env.media-incoming`, zálohovací export `.env.media-backup`, oba 0600.
`scripts/connect-media-runtime.sh` pod produkčním zámkem zálohuje a upraví
`.env.production`, obnoví jen API ze stejného image a při neúspěchu vrátí
předchozí konfiguraci. Žádné tajné hodnoty nepatří do repozitáře ani výstupu.

`scripts/backup-media.sh` a `scripts/media-backup.mjs` jsou instalované v
`/srv/studio-balance/`. Záloha se spouští denně ve 03:40
časové zóny serveru; každou hodinu v :15 probíhá `--check` (stáří do 36 h a
SHA-256). `scripts/install-media-backup-cron.py` idempotentně spravuje pouze
označený blok crontabu účtu `voldzi`, se zálohou původního crontabu. Není
potřeba sudo ani trvale přihlášená uživatelská session.

Zálohy leží v `/srv/x5-production/backups/studio-balance/media/` (0700) na `docker.home.cz`, odděleně od storage
hostitele. Manifest obsahuje původní klíč, S3 verzi, velikost a SHA-256;
soubory mají oprávnění 0600. Snapshot se zveřejní jako dokončený až po
dokončení všech zápisů. Retence se aktivuje pouze výslovným potvrzením správce; viz ADR 0024. Záloha vyžaduje po zápisu rezervu aspoň 5 GiB.

Ověření 5. 9. 2026: aplikace provedla `prepareImage`, upload a readback;
verzování je aktivní; neautorizované čtení, cizí bucket a zápis read-only účtem
byly odmítnuté. Obnova testovacího objektu z kopie na druhém serveru po
smazání aktuálního originálu prošla porovnáním SHA-256. Test nevytváří
veřejný obsah a nenahrazuje přihlášený akceptační průchod administrátora.

S3 availability nezpřísňuje celkovou readiness rezervací. Selhání zálohy je
v `media-backup.log` a nenulovém návratovém kódu; doručování centrálního alertu
je samostatné provozní zapojení. Obnova publikovaných médií musí respektovat
metadata v PostgreSQL, viz runbook.


ADR 0013 configuration: OIDC_OPERATIONS_CLIENT_ID (default studio-balance-operations), OIDC_OPERATIONS_CLIENT_SECRET (required for switching registration; distinct local/production secret). Pending identity sync retries at startup and every 30 seconds; admin displays pending/error until confirmed. Review existing future reservations manually when closing; no automatic cancellations. Check public no-store status and direct Keycloak registration denial after rollout.

OIDC_OPERATIONS_ISSUER_URL: optional trusted internal Keycloak realm URL; production compose maps existing OIDC_BACKCHANNEL_ISSUER_URL and joins the existing Keycloak network for API operations. Public admin endpoints of Keycloak need not be exposed. Provision with scripts/provision-registration-control.py --production on docker.home.cz, or --local for local dependencies. Provisioning initially disables registration and preserves existing runtime variables in a private backup.

Production activation can be completed interactively with
`ssh -t docker.home.cz 'bash /srv/studio-balance/activate-production-registration.sh'`.
The wrapper prompts for master admin credentials/MFA without echo or history,
provisions only the dedicated studio realm account, backs up runtime configuration,
recreates only API with the same image, verifies readiness and closes both controls.
Master credentials are never written to disk. Failed startup restores runtime config.

HTML is dynamic/no-store to prevent a CDN from retaining old operational UI.
WEDOS Protection may still hold HTML cached before this change; purge the
studio-balance.cz CDN cache once in the WEDOS administration after deployment.
Verification must distinguish fresh origin/query responses from the ordinary public URL.

Deployment check, 2026-09-05: production a92bdb1 runs the updated dependencies,
announcement, booking gate, PWA dialog fix and HTML private/no-store response.
API, web and worker are healthy; readiness confirms a92bdb1. The dedicated
Keycloak operations credential was securely imported and temporary transfer files
removed; closed registration synchronization was verified before this rollout.
The disk guard passed after user-approved cleanup of unused build cache; images
and data volumes were preserved. The ordinary public homepage still returns an
old WEDOS CDN response; clear that cache once to expose the fresh origin HTML.

Deployment check, 2026-09-08: production 2ed030d runs NestJS 12, Vitest 5,
the refreshed runtime dependencies and hardened Node.js 24.20.0 Alpine images.
API, web and worker are healthy and readiness confirms 2ed030d. Public studio
status remains closed; registration and booking stay paused. Fresh public HTML
returns private/no-store and the CDN bypasses it. Runtime containers contain no
npm/Corepack CLI. The rollout preserved the previous a92bdb1 images for rollback.

The approved UI setup may instead create studio-balance-operations and assign
realm-management/manage-realm in the studio-balance realm. After authorized secure
credential transfer, scripts/connect-registration-runtime.sh consumes only the
mode-0600 .env.registration-incoming with the dedicated client ID and secret,
merges the API runtime, removes the transfer file, and verifies closed synchronized state.
Never export a master browser session/token or print any client secret.

## Kontrola knihoven

Při aktualizacích ověřit `pnpm outdated -r`, aktualizovat přímé i nepřímé závislosti, spustit `pnpm audit`, `pnpm check` a místní integrační testy. Výsledek poslední aktualizace je v [dependency-audit.md](dependency-audit.md). Aktualizace pracovního repozitáře sama o sobě nemění produkční kontejnery.

Produkční runtime obrazy musí před vydáním projít skenem známých zranitelností.
Dockerfile používá digestem připnutý Node.js obraz, během sestavení aktualizuje
Alpine balíčky a z runtime vrstev odstraňuje npm a Corepack. Při změně digestu
se znovu sestaví a zkontrolují všechny tři cíle: web, API a worker.
Stejný gate běží v CI pomocí Trivy; vysoké a kritické nálezy blokují vydání.

## Průběžné vypisování rozvrhu (ADR 0014)

Worker používá stejnou produkční `DATABASE_URL` jako API; nejde o nový secret.
Po migracích načte pravidla `weekly_schedule_rules`, při startu a každých šest
hodin doplní konkrétní termíny do tří kalendářních měsíců. Zápis používá
databázový zámek, unikátní identitu pravidlo + místní datum a audit
`session.created`. Při kolizi nebo nedostupné DB worker vypíše
`weekly_schedule_failed` a v produkci skončí s nenulovým kódem; Compose jej
restartuje. Log úspěchu obsahuje `weekly_schedule_generated` a počty nových a
přeskočených termínů bez osobních údajů.

Po nasazení ověřit počty a krajní datum v admin rozvrhu, oba časy Barre za
270 Kč, páteční i nedělní Power Yogu, nulovou sobotu a zachování dříve
zrušených termínů. Druhý běh generátoru nesmí nic zdvojit. Správce v
Pravidelném týdenním plánu vypne další generování konkrétního času; už vypsané
termíny případně ruší přes Hromadnou změnu rozvrhu. Při pozastavení workeru
se horizont zkracuje a je třeba zasáhnout dříve, než bude kratší než 30 dní.

Migrace `0023_confirmed_autumn_prices.sql` mění podle CD-057 aktivní
rezervace budoucího Barre na 270 Kč včetně cenového snapshotu a zároveň
nastavuje budoucí Balance Flow na 160 Kč. Před vydáním ověřit počet
dotčených rezervací a případné aktivní/uhrazené storno poplatky; při jejich
výskytu migrace odmítne celý zápis. Po vydání ověřit cenu termínů i
rezervací, záznam `booking.price_corrected` a klientské oznámení.
Následná migrace `0024_cancelled_balance_flow_display_price.sql` sjednotí
zobrazenou cenu zrušených budoucích termínů Balance Flow na 160 Kč, aniž
změní jejich stav nebo cenu rezervací.
Zrušené a historické rezervace se neupravují. Přesné datum zahájení Barre
dosud nebylo potvrzeno; cenová migrace termíny neposouvá ani neruší.

Další změny cen typů lekcí provádí správce v administraci v Rozvrhu. Před
uložením musí zkontrolovat náhled dopadu; po souběžné nové rezervaci nebo změně
termínu je nutné jej obnovit. Výchozí volba ponechá potvrzeným rezervacím
původní cenu. Pokud správce výslovně mění i jejich cenu, zkontroluje audit
`booking.price_corrected` a zprávy v účtu. Splatný či uhrazený storno poplatek
blokuje celý zásah. Samotné nasazení této funkce nic nepřepočítává.

Pravidelný den, čas, instruktora, kapacitu a předstih rezervací správce mění
akcí „Upravit pravidelnou lekci“. Náhled ukazuje počty termínů a rezervací.
Uložení pod databázovým zámkem mění jen odpovídající budoucí termíny;
jednotlivě změněné výjimky zůstávají. Při změně času nebo instruktora se
ověří zprávy klientům, připomínky a audit `weekly_schedule_rule.updated`.
Po změně dne se ověří nový den v admin rozvrhu i po dalším běhu workeru;
kolize nebo přeplnění vracejí chybu bez dílčího zápisu.

### Zrušení jedné lekce předem (CD-071)

Provozovatelka otevře **Rozvrh → Zrušit jeden termín**, vybere **Datum lekce**
a konkrétní lekci z nabídky daného dne. Zkontroluje název, přesné datum a čas,
instruktora a počet rezervací. Vyplní **Důvod zrušení pro klienty**, zaškrtne
potvrzení jediného termínu a zvolí **Potvrdit zrušení tohoto termínu**.
**Ponechat termín** zavře formulář bez změny. Po úspěchu lze ihned vybrat další
termín. Stejný postup se otevře také tlačítkem **Zrušit** v týdenním
seznamu. Pro lekci za několik týdnů použít datum v Rozvrhu; seznam v sekci
Rezervace nabízí pouze nejbližších 14 dní. Pokud termín ještě nebyl vypsán,
nemá se kvůli jednorázové výjimce rušit celá pravidelná řada.

Jde o jediný termín: ostatní časy a pravidelný plán zůstávají. Nové rezervace
se zablokují a stávající se zruší bez storno poplatku. Klienti s rezervací
obdrží zprávu ve svém účtu. E-mail se tímto postupem neslibuje. Automatický
generátor zrušený termín sám neobnoví; případné obnovení je samostatná
výslovná akce a neobnovuje původní zrušené rezervace.

Výběr data filtruje termíny již načtené v administraci; kontrolní načtení
ze serveru proběhne až před zrušením. Pokud se změnily údaje, formulář
vyžádá novou kontrolu.
Při chybě se zachová napsaný důvod a úspěch se nezobrazí. Provozní ověření
po skutečném zrušení zahrnuje stav termínu, nemožnost nové rezervace,
`session.cancelled` v auditu a zprávy dotčených účtů. Aktuální počet v náhledu
není serverovým tokenem dopadu; konečný souběh s novou rezervací řídí původní
transakční API. Nasazení této pomůcky samo žádnou lekci neruší.

Jednorázová migrace `0025_balance_flow_bookings_and_barre_capacity.sql` podle
CD-059 sníží cenu aktivních budoucích rezervací Balance Flow na 160 Kč bez
jejich zrušení a nastaví kapacitu obou pravidelných časů Barre i budoucích
termínů na 8. Před spuštěním ověřit počet dotčených rezervací, existenci
storno poplatků a maximální obsazení Barre; migrace se při kolizi celá vrátí.
Po spuštění ověřit ceny rezervací, kapacity pravidel i termínů, audit a
klientská oznámení. Migrační skript lze spustit před obrazem nové verze pouze
se záznamem názvu a přesného checksumu v `schema_migrations` v téže transakci.

Administrátorská volba zapamatování zařízení zůstává výchozím stavem
vypnutá. Při opakovaném dotazu na MFA zkontrolovat, zda byla na soukromém
zařízení zaškrtnutá, zda nejde o soukromé okno či smazané cookies a zda
uživatel neprovedl odhlášení. Produkční realm má 30denní idle a 90denní
maximum; tvrzení „kód pouze jednou za tři měsíce“ není bezpodmínečná
garance. Pokud problém trvá i se zaškrtnutou volbou, korelovat čas pokusu
s `admin_oidc_login_failed` a Keycloak událostmi bez výpisu tokenů.

## Verze pravidelného rozvrhu

Migrace 0026 zavádí ukončení a návaznost pravidel a dostupnost rezervací;
0027 přidává schválený katalog Body Sculpt. Provozní změna termínů probíhá
auditovaným náhledem a potvrzením v administraci, nikoli katalogovou migrací.
Worker musí být ve stejné nebo novější verzi než API se změnami dle ADR 0018.
Rollback starého workeru po vytvoření verzí vyžaduje jeho zastavení.

Obnova a odhlášení aplikačních relací v API používají stejně jako web
`OIDC_BACKCHANNEL_ISSUER_URL` pro token endpoint a JWKS. Podpis, veřejný
issuer a audience se nadále ověřují; veřejná DMZ ochrana se nevypíná.
Po nasazení ověřit úspěšnou obnovu existující MFA relace starší než 15 minut
a zachování původního `mfa_verified` i absolutní expirace. Viz ADR 0019.

### Nasazení doprovodu

Migrace 0028 doplní účastníka a čas přijetí odpovědnosti; staré rezervace zůstanou
vlastní místa. Nasazení nemění ceny, kapacity ani již potvrzené rezervace.
Podmínky jsou verze 2026-10-04. Po vytvoření rezervací doprovodu preferujte
opravu vpřed: starší web neumí správně označit účastníky, přestože stále počítá
každý řádek do kapacity. Při nutném rollbacku nejprve pozastavte nové rezervace,
neupravujte ani nemažte účastnická data. E-mailový outbox není důkazem doručení;
provozní informace jsou v účtu vlastníka.

## Shared public analytics preparation (2026-10-04)

ADR 0021 and `analytics/integration.md` define the default-off public pageview bridge
and release checks. `analytics/privacy-review.md` contains unpublished CS/EN owner
review drafts. No identified, private, reservation, form or click collection; no new
analytics service or database. Activation and end-to-end shared collector validation
remain pending and must not be represented as completed.

## Approved shared analytics activation (2026-10-04)

Supersedes the earlier default-off preparation: the owner approved the exact
CS/EN notice ef5cbf7 in VCode (approval record 0527093). Publish that supplement
and preserve enabled=true / privacyNoticeApproved=true in normal releases.
Scope and all private-session, DNT/GPC and offline protections in ADR 0021 remain.
Central registry activation and final ingestion verification follow public notice
acceptance; never treat a frontend deployment as proof of received statistics.

## Approved v2 analytics candidate (2026-10-04)

ADR 0022 supersedes the earlier no-click/no-source scope only for the specifically
reviewed v2 replacement (VCode 6dc4dd3, owner approval a56b160). Exact eight public
paths and privacy/session exclusions remain. Only explicit outbound-click on the
Masáže recommendation and Instagram/Facebook links; no destination/content fields.
The local candidate selects v2, captureSources=true. The approved paragraph is
selected with the runtime version; retained v1 text is fallback only. Production
changes wait for the coordinator slot; local tests are not ingestion proof.


## Approved TikTok source runtime — 2026-10-05

ADR 0023 records the verified owner approval to recognize only the TikTok service
label. Serve byte-exact VCode public-v2-tiktok.js as /vcode-analytics-tiktok.js,
SRI sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5.
This narrow exception supersedes the earlier no-copy runtime rule. The existing
v2 endpoint, website ID, gates, exact paths/events, anonymous-session boundary,
DNT/GPC, offline discard and published CS/EN notice are unchanged. Raw URLs,
profiles and videos are never sent; lookalike domains are not TikTok. Release
checks validate committed asset bytes and actual runtime privacy tests. Browser
acceptance uses an isolated memory sink or blocked collector. VCode alone updates
the central registry after verified deployment. Deployment evidence is recorded
in docs/analytics/integration.md.

## Latino Ladies replacement — 2026-10-06

CD-064 was applied using the existing audited administrative services. The two
Power Yoga rules become Latino Ladies from 2026-10-16: Friday 17:30–18:30 and
Sunday 18:00–19:00, Xavier Tihelka, capacity 12, price 200 CZK. All 24 affected
created sessions were verified at capacity 12 and price 20000 cents. No active
bookings were affected, so no client notifications were generated. All seven
historical/existing Yoga booking records retained their status and price; the
9 October booking and earlier sessions remain unchanged.

The existing Latino Ladies profile was reused and supplied poster/portrait
uploaded to dedicated media storage. Request receipt:
`c55b1b1d-2bb6-4142-80b9-e51e08be413a`. Public API omits numeric capacities.
Public uploaded lesson images are already normalized WebP and are displayed
directly; Next image optimization cannot resolve their API proxy internally.
This applies to catalog, detail and account favorites. Static bundled images
retain optimization. Production acceptance includes rendered images and both
first dates (16 and 18 October), in addition to service health.

CD-065: Power Yoga je okamžitě stažena z veřejné nabídky. Zbývající termíny 9. a 11. října mají pozastavené rezervace; profil je neaktivní. Vyřízení jedné rezervace 9. října vyžaduje rozhodnutí provozovatele, bez automatického přesunu či storna.

Veřejný katalog a rozvrh včetně detailů vrací Cache-Control: no-store, aby CDN po změně lekce neuchovávala starou nabídku. Kontrola hlavičky je v schedule.controller.test.ts. Při již existující CDN cache je nutné ověřit obnovu veřejné odpovědi.

## Studio Balance storage separation (2026-10-07)

See [storage and retention runbook](production-storage.md) and ADR 0024.
Deployment root is `/srv/studio-balance`; X5 UUID is
`2f93f595-b61b-4eea-9054-7afa9b275b5b`. Production deploy and rollback
require the storage guard and `/srv/studio-balance/storage-compose.yml`.
No secrets or production environment variables change. Web cache is bounded
128 MiB tmpfs; shared Docker image/build storage remains unchanged.

Production delivery uses a unique X5 staging directory and the exact selected
commit's tools. The remote entrypoint holds the operation lock before live
publication and the media lock during atomic tool replacement. The child deploy
verifies its inherited lock inode. New deploys require this entrypoint; retained
older revisions remain rollback-only. Never replace these tools directly with
SCP or manually truncate a live maintenance script.

Delivery/rollback acceptance verifies API, web and worker image tags/IDs,
APP_VERSION and health, plus a worker successful generation since startup.
The worker uses a private 4 MiB `/tmp` tmpfs and an atomic readiness marker that
expires after seven hours. It needs no new persisted environment setting.
Retention validates the latest, independently verified anchor and every other
retained media snapshot before deleting alternatives; any integrity failure
stops cleanup.

Production security release 2026-10-07: web/API/worker run revision
`1923ef305c679d0da28c3973e86ea3e5f886bf96`; the later edge-only corrections
are `162e70c` and `bc18d54`. Exact identities, scan receipts, public HTTP
acceptance, Nginx backup paths and verification limits are recorded in
[the release verification](security-performance-verification-2026-10-07.md).
Previous verified app revisions retained for rollback are `0d016c0` and
`817f7ff`; always recheck `verified-releases.json` before a later rollback.

## Potvrzení lekce a měsíční výkazy (CD-066–068 / ADR 0026)

Tento řez přidává provozní evidenci výuky; neprokazuje, že je již nasazený.
Release používá standardní společnou revizi web/API/worker a všechny stávající
scan, zálohovací, X5 a health brány. Nový secret, externí služba, plánovač ani
produkční změna pracovních smluv nejsou potřeba.

Migrace 0029 přidává výkazy instruktorů bez automatického doplnění historie.
Migrace 0030 mění název Body Sculpt na Formuj břicho a hýždě; zachovává ID,
slug, pravidla, rezervace i jejich ceny. Původní výchozí
`/images/studio-balance/lessons/body-sculpt.jpeg` nahradí připravený derivát
`/images/studio-balance/lessons/formuj-bricho-a-hyzde.png` s opraveným
nadpisem; jiný individuálně nahraný obraz se nepřepisuje a dodaný originál
zůstává zachovaný. Po release ověřit skutečně vykreslený nadpis i cestu obrázku.
Před release ověřit DB zálohu; následný rollback aplikace nemaže tabulku
výkazů, audity ani potvrzené údaje. Návrat datové migrace destruktivním SQL
není běžný rollback. Produkční databáze zůstává přes `haproxy.home.cz:5000`.
Starší webový image nový výchozí PNG neobsahuje: před jeho aktivací podmíněně
vrátit pouze výchozí cestu a alt na původní `body-sculpt.jpeg`; vlastní uploady
ani přejmenování lekce tím neměnit. Podrobnosti a lokální důkazy:
[ověření 2026-10-09](attendance-instructor-records-verification-2026-10-09.md).
Starší API nemá nové ochrany rušení potvrzených lekcí a oprav docházky
s uhrazeným/prominutým poplatkem; při rollbacku tyto zápisy pozastavit
do návratu opravené verze.

Postup pro administrátorku:

1. Po skončení lekce otevřít konkrétní termín a potvrzení lekce.
2. Označit pouze nepřítomné. Zkontrolovat instruktora, případný záskok,
   skutečný začátek/konec a odměnu. Neznámou odměnu ponechat k doplnění.
3. Potvrdit společně účast ostatních a výkaz. Neúčast má dosavadní poplatek;
   prominutí/úhrada se řeší samostatně. Při konfliktu načíst nový seznam.
4. V měsíčních výkazech doplnit ukončené nepotvrzené termíny a chybějící
   odměny. Změnu docházky po potvrzení zkontrolovat před uzavřením odměny.
5. Vybrat měsíc a vytisknout/exportovat provozní přehled. Zkontrolovat
   varování neúplnosti; počet nepotvrzených lekcí a chybějících odměn
   zůstává viditelný i v tisku/CSV. Přípravu či jinou pracovní dobu evidovat odděleně.

Akceptace release odděleně ověří migrace, snapshoty/záskok, jeden atomický
zápis a retry, fee korekce, měsíční hranice v Praze, tisk/CSV, soukromé
hlavičky a návrat Novinek/Zpráv po přihlášení. Výkazy jsou trvalá uživatelská
data v PostgreSQL, nikoli obnovitelná cache. Nevztahuje se na ně čtrnáctidenní
úklid pracovních souborů; retenční politika vyžaduje samostatné rozhodnutí.
Test obnovy musí obsahovat výkazy i audit. Lokální test není důkaz produkční
nebo fyzické PWA akceptace.

## Diagnostika opakovaného přihlášení (CD-069 / ADR 0027)

Migrace 0031 přidává k relaci první důvod revokace, vymezený detail a request
ID. Nemění stávající relace ani secret. Nasazovat společně web/API/worker;
rollback na předchozí aplikaci ponechá aditivní sloupce i záznamy. Nevymýšlet
zpětně důvody pro historické záznamy, kde jsou nové sloupce prázdné.

Při dalším vyžádání OTP korelovat explicitní vstup na přihlášení,
vydání/odstranění cookie a událost zneplatnění podle času a request ID.
Kontrolovat jen přítomnost a atributy cookie; nekopírovat její hodnotu do
chatu, dokumentace nebo logu. Samotná chybějící cookie neurčuje příčinu.
Bez zapamatování je cookie do zavření prohlížeče; se zapamatováním nadále
platí maximum 90 dní, neaktivita 30 dní a bezpečnostní revokace. Provozní
událost dočasně nedostupné revalidace není revokace a nevyžaduje reset MFA.

Před release ověřit migraci v testovací DB a zálohu. Po release ověřit
readiness, shodnou verzi procesů a pokračující platnost přihlášené relace.
Řízené logout/expiry/identity-error testy patří do izolovaného prostředí;
neodhlašovat skutečné administrátory jen pro vytvoření ukázkového logu.

Provozní reakce podle důvodu:

| Důvod | Další ověření |
| --- | --- |
| `absolute_expired`, `idle_expired` | Ověřit dobu platnosti a vysvětlit nové přihlášení. |
| `refresh_credential_missing`, `refresh_credential_unreadable` | Ověřit integritu konfigurace a případnou změnu `SESSION_SECRET`; tajné hodnoty nevypisovat. |
| `provider_invalid_grant` | Prověřit odmítnutý refresh a zneplatněnou/expirovanou relaci Keycloak. |
| `identity_token_invalid`, `subject_changed` | Korelovat pevný detail a konfiguraci identity; nepřebírat volný text/token. |
| `admin_role_removed` | Ověřit přiřazení role, neobcházet MFA ani kontrolu oprávnění. |
| `explicit_logout` | Běžné vědomé odhlášení. |

Samostatné `application_session_revalidation_unavailable` znamená dočasnou
chybu poskytovatele. Ověřit jeho dostupnost; neodvolávat relace ani resetovat
MFA jako náhradu za opravu dostupnosti.

## Klientské recenze a jejich kontrola (CD-072)

`PUBLIC_APP_URL` již existuje pro kanonické odkazy; nově musí být stejná
ve webu i API, protože API kontroluje přesný origin anonymního odeslání.
V produkci použít `https://studio-balance.cz`, lokálně jen izolovaný lokální
origin. Při chybějícím/neplatném nastavení výzvu ani odesílání neotevírat.
Existující `SESSION_SECRET` podepisuje oddělený účel výzvy; nezavádí se nový
secret nebo externí poskytovatel. Rotace zneplatní nevyužité výzvy, nikoli
uložené recenze. Načtení i odeslání výzvy používá `no-store`.

Nasazení nejprve aplikuje nedestruktivní migraci tabulek návrhů a krátkodobých
počítadel, poté sladěné API/web. Migrace neobsahuje ukázkové recenze a nemění
stávající reference ani rezervace. Ověřit anonymní formulář, přenos originu
přes veřejnou proxy, ochranu proti podvržení forwarding hlaviček, odmítnutí
admin API bez relace a běžné veřejné recenze. Produkční acceptance nesmí
zveřejnit smyšlenou recenzi jen pro demonstraci.

Krátký pracovní postup správce je v [reviews-guide.md](reviews-guide.md).
QR tisk má `/recenze/qr` a lokální asset
`/images/studio-balance/reviews-qr.svg`; jeho obsah musí být přesná kanonická
adresa formuláře. Nevede na Google, přihlášení ani statistický redirect.

Zálohy PostgreSQL zahrnují návrhy, souhlasy, vazby i audit v existující politice;
S3 záloha nepotřebuje textové recenze. Nové osobní/auditní záznamy nemají
automatické mazání, dokud vlastník nepotvrdí retenční politiku. Technická
počítadla expirují po 2 hodinách. Stávající worker každých 10 minut smaže
nejvýše 500 již expirovaných řádků, s ochranou proti souběhu v procesu;
stejný omezený úklid doplňuje přijetí nového návrhu. V běžném provozu se
řádky fyzicky odstraní do následujícího 10minutového cyklu po expiraci,
i když se nové recenze neposílají. Nikdy se tím nemažou návrhy nebo audit. Při limitu 429 vyčkat, než předchozí odeslání opustí hodinové okno;
neobcházet limiter odlišnou
konfigurací pro studio. Při 503 zkontrolovat readiness, DB a shodu originu;
pouhá přítomnost formuláře není důkaz přijetí dat.

Rollback aktivuje předchozí ověřené aplikační obrazy podle obvyklého postupu.
Nové tabulky se ponechají, nerozběhne se down migrace ani smazání návrhů.
Starší aplikace jejich obsah nepublikuje; již schválené reference zůstávají
běžným veřejným obsahem a studio je může samostatně skrýt. Diskové a X5
hranice ani retence ostatních dat se tímto řezem nemění.

## Obnova hesla a ochrana přihlášení (CD-073 / ADR 0031)

Konfigurátor `scripts/configure-keycloak-recovery.py` spravuje pouze realm
`studio-balance`, dočasné blokování a samostatný password-only reset flow.
Používá existující operations klient s `manage-realm`; nezískává `manage-users`,
nečte hesla ani neprovádí změnu zákaznického účtu. Credentials se načtou
v paměti existujícího API procesu a předají přes `--auth-stdin`, případně ze
samostatného souboru 0600. Nikdy se nevypisují ani neukládají do lokální `.env`.
Admin API na `login.studio-balance.cz` zůstává z internetu zakázané.
Konfigurace používá existující schválený TLS správcovský vstup sdíleného
Keycloaku; jeho discovery musí potvrdit issuer `login.studio-balance.cz`.
HTTP je dovoleno s `--allow-loopback` pouze pro skutečně lokální test či
zabezpečený lokální tunel; nevystavuje se nový port ani správcovské API.
Produkční Keycloak aktuálně publikuje port pouze na své interní síťové
adrese, nikoli na loopbacku hostitele.

Režimy: `check` je čtení, `apply-policy` zapne pouze dočasnou ochranu,
`apply-recovery` navíc ověřenou obnovu s importem SMTP a `rollback` obnoví
soukromý snapshot. `apply-configured-recovery --smtp-delivery-verified` použije
SMTP, které správce již bezpečně zadal a otestoval přímo v Keycloaku. Tento
režim ověří autentizované TLS, SMTP nepřepisuje ani neexportuje jeho heslo;
SMTP není součástí jeho snapshotu ani rollbacku. Odmítá SMTP vstupní soubory.
Každá změna vyžaduje nový snapshot 0600 v adresáři 0700 na ověřeném X5,
například v `/srv/x5-production/archives/studio-balance/identity-recovery/`.
Před zápisem vždy spustit `check-production-storage.sh`; při nedostupném X5
se nevytváří náhradní kopie na interním disku. Snapshot obsahuje pouze měněné
hodnoty; při existujícím SMTP je nutný úplný původní secret, maskované heslo
z Admin API není použitelný rollback. Konfigurátor neobchází toto omezení.
Tato potřeba původního SMTP secretu se týká pouze režimu, který SMTP mění;
aktivace nad již nastaveným SMTP ponechává jeho nezměněnou konfiguraci na místě.

SMTP mapa je samostatný soubor 0600: `host`, `port`, `from`, `fromDisplayName`,
`ssl` nebo `starttls`, `auth`, `user`, `password` a volitelné timeouty. Veřejné
SMTP vyžaduje autentizaci a TLS. Nešifrovaný privátní relay smí použít jen
výslovně schválený `--approved-private-relay`; nejde o automatický fallback.
`apply-recovery` vyžaduje také `--smtp-delivery-verified`: nejprve doručit
testovací zprávu do kontrolované schránky a ověřit celé obnovení testovacího
účtu. Neutrální obrazovka o odeslání ani SMTP akceptace neprokazuje přijetí
ve schránce. Poskytovatel a odesílatel musí být schválení, cizí tenant klíč
se nepřebírá. Reset nesmí spustit zpracování starého `notification_outbox`.

Password-only flow má tři REQUIRED kroky a `force-login=true`; reset OTP
není přítomný. Odkaz platí 900 sekund. Admin se po obnově musí znovu
přihlásit heslem a svým existujícím TOTP. Předlohu tématu publikovat do nové
verzované složky v existujícím mountu `/opt/keycloak/themes`, ověřit soubory
a změnit pouze `loginTheme` tohoto realmu. Předchozí jméno tématu uložit
soukromě pro rollback. Staré téma se nemaže a sdílený Keycloak se nerestartuje.

Před aktivací obnovy spustit samostatný DMZ privacy gate: kopie
`harden-studiobalance.py`, `harden-studiobalance-recovery.py` a testů do
soukromého pracovního adresáře, izolovaný `test-recovery-privacy-runtime.py`,
pak nejprve dry-run a až poté `--apply --expected-version <live-sha>`.
Nástroj zachovává ostatní vhosty, analytics include a TLS, zálohuje obě
varianty konfigurace a při chybě syntaxe/readiness vrátí původní soubory.
Ověřit `smoke-recovery-privacy.py` s neškodným kontrolním řetězcem.
Dedicated identity access log obsahuje pouze čas, metodu, URI bez query,
status, délku a request ID. Raw identity error log je úmyslně vypuštěný,
protože i kritické chyby Nginxu mohou obsahovat celý reset odkaz; chyby
zůstávají dohledatelné přes bezpečný access status a chráněný Keycloak log.
`no-referrer` chrání také dotazy načítání zdrojů tématu.

Obnovení klienta: po schválení vyvolat jednu standardní žádost na jeho
registrovaný e-mail. Nečíst odkaz z cizí schránky, nenastavovat dočasné heslo,
nemazat účet a nevytvářet rezervaci. Oddělit stav odesláno, doručeno a klient
dokončil reset. Požadavek nepřidává přímé veřejné hledání účtů ani nový API
endpoint; nezavádí analytiku přihlášení ani novou retenční politiku historie.

### Ověřený produkční stav 15. 10. 2026

Z revize `bb259099b2c3707f5429b862ca0538b2e5d44670` byla samostatně nasazena
identity část, nikoli nové aplikační obrazy:

- Realm `studio-balance`: dočasná ochrana po pěti chybných pokusech, prodleva
  roste od 60 do nejvýše 900 sekund; trvalé blokování vypnuté. Ostatní hodnoty
  realmu se porovnáním před/po nezměnily.
- Aktivní `loginTheme=studio-balance-recovery-bb259099`; úplnost osmi souborů
  a jejich SHA-256 ověřena před přepnutím. Česká nápověda byla ověřena na
  skutečném veřejném loginu. Bez ověřeného SMTP se odkaz pro reset nezobrazuje.
- Snapshoty v soukromém adresáři X5
  `/srv/x5-production/archives/studio-balance/identity-recovery/`:
  `policy-before-20261015T164550Z.json` a `theme-before-20261015T164720Z.json`.
  Změny proběhly pod `/srv/studio-balance/.production-operation.lock`.
  Sdílený kontejner se během těchto změn nerestartoval; jeho předchozí
  start byl `2026-10-15T16:34:23.814643196Z`.
- DMZ: bezpečné identity logování, `no-referrer` a omezení POST na
  `login-actions` jsou aktivní. Transakční záloha obou konfigurací je
  `/var/backups/studiobalance-nginx/20261015T164518.661475Z-082d9ce7fda0/`.
  Opakovaný dry-run neplánuje změnu; tři neškodné kontrolní požadavky
  (400/404/301) potvrdily bezpečné hlavičky i nepřítomnost query a citlivých
  hlaviček v pěti sledovaných logách. Analytics include zůstal byte-exact.
- Instalovaný `/usr/local/sbin/studiobalance-install-nginx` byl po záloze
  atomicky aktualizován na SHA-256
  `de8d07d3ae1bf2f6abce0de990c91b9317e7f876a1b9cdbde50d75e739b6cca6`,
  aby další publikace tyto kontroly zachovala. Plný instalátor se nespouštěl,
  sudoers se neměnil. Ověřené zdroje DMZ helperů jsou v podadresáři
  `reviewed-tools` uvedené root-owned zálohy.

První část rollout ponechala `resetPasswordAllowed=false` bez SMTP a původní
aplikační verzi `082d9ce7fda001c85deb0479a1b1fe59dcd8fb69`. Nový web tehdy
blokovala existující rezerva nejméně 20 GiB na interním disku; guard nebyl
snížen a nebyl použit plošný Docker úklid.

Po uživatelově potvrzení uvolnění disku (před sestavením asi 29 GiB) byl
15. 10. 2026 dokončen standardní deployment `7a00e0a`. Prošly všechny tři
image scany, migrátor i kontrola přesné produkční revize API/web/worker včetně
čerstvé worker generation. Veřejné `/prihlaseni` vrací 200 a obsahuje novou
nápovědu pro již registrované klienty. Scan evidence:
`/srv/x5-production/archives/studio-balance/image-scans/7a00e0a/20261015T172605Z-GPocLcJe/`.
Řádná retence ponechala `7a00e0a`, `082d9ce7fda001c85deb0479a1b1fe59dcd8fb69`
a `3e6691c0967e5470842a9199f10777e80394ba0a`; ukončené vydání `27b6e11`
včetně tří již nepoužívaných tagů odstranila podle schválené politiky.

Uživatel schválil odesílatele `podpora@zeleznalady.cz` obdobně jako u Moje porce.
SMTP je nyní uložené přímo v realmu Studio Balance: `smtp.mail.me.com:587`,
STARTTLS a autentizace, jméno odesílatele Studio Balance. Heslo pro aplikaci
zadal a uložil uživatel přímo v Keycloaku; nebylo exportováno. Uživatel
potvrdil skutečné doručení prvního testovacího e-mailu. Závěrečná kontrola
opravila From na schválené `podpora@zeleznalady.cz`, následný SMTP test
potvrdil přijetí zprávy a konfigurace byla uložena. Doručení tohoto druhého
testu není samostatně potvrzené příjemcem.

Obnova hesla byla aktivována 15. 10. 2026 v 17:39:41 UTC režimem
`apply-configured-recovery` ze servisní revize `12307a8`, pod aplikačním
zámkem a po kontrole X5. Aktivní je `resetPasswordAllowed=true`, flow
`studio-balance-password-recovery`, platnost odkazu 900 sekund a vynucené
nové přihlášení po resetu. Flow neobsahuje reset OTP; administrátorské MFA
zůstává zachované. Porovnání před/po potvrdilo nezměněné SMTP a ostatní
nastavení realmu; sdílený Keycloak nebyl restartován. Soukromá evidence:
`/srv/x5-production/archives/studio-balance/identity-recovery/recovery-before-20261015T173941Z.json`
a `activation-20261015T173941Z.json` ve stejném adresáři. Snapshot neobsahuje
SMTP secret.

Na skutečném veřejném loginu je viditelný odkaz „Zapomenuté heslo?“ i
nápověda „Nastavit nové heslo“. Pro dotčenou klientku byla přes tento formulář
odeslána právě jedna žádost o obnovu; formulář zobrazil neutrální potvrzení
odeslání pokynů. Doručení do její schránky ani následné nastavení hesla a
přihlášení klientkou zatím nejsou ověřené. Heslo, OTP, účet ani rezervace
nebyly ručně měněny. Příjemkyně musí otevřít odkaz do 15 minut a heslo si
nastavit sama; při vypršení může požádat o nový odkaz. Případná dočasná
blokace po chybných pokusech může vyžadovat až 15 minut bez dalších pokusů.
Kompletní reset včetně zachování admin OTP prošel v izolovaném Keycloaku
26.8.0; rozšířený konfigurátor má 25 úspěšných unit testů.

Rollback identity provést pod stejným aplikačním zámkem po kontrole UUID X5:
policy obnoví konfigurátor režimem `rollback --snapshot <policy-before>`
a credentials pouze přes chráněný vstup. Téma vrátí úzce vymezený Admin API
PUT pouze `loginTheme` na `previousLoginTheme` ze soukromého theme snapshotu,
po ověření, že aktuální vazba odpovídá jeho `newLoginTheme`. Původní složka
`studio-balance` zůstala zachovaná. DMZ rollback obnoví obě přesné kopie
ze zálohy se stejnými metadaty, provede `nginx -t`, reload a readiness;
samostatně se případně vrátí zálohovaný instalátor. Žádný z těchto rollbacků
nemění účty, hesla, OTP, rezervace nebo aplikační databázi.


## Odhlášení klienta správcem — nasazení CD-074

Migration 0033 přidává pouze admin_booking_cancellation_receipts; existující
rezervace ani poplatky nemění. Ověřit default grants migrátora pro aplikační roli.
Nasadit API/web společně standardní cestou včetně image scans, přesné revize,
worker generation a analytics gate. Zachovat omezené logování i X5 guards.
Rollback aplikace ponechá novou tabulku i již provedená odhlášení; rezervace ani
finanční historii automaticky neobnovovat. Produkční ověření formuláře provést
bez zrušení skutečné rezervace, není-li konkrétní zrušení výslovně autorizované.

Produkční revize `54216e8` byla nasazena 18. 10. 2026 standardním
nasazovacím postupem. Všechny tři image scans prošly; soukromá evidence je
`/srv/x5-production/archives/studio-balance/image-scans/54216e8/20261018T110319Z-XUN4g4OC`.
Ověření přesných obrazů API/web/worker, readiness a první generace rozvrhu workeru
prošlo. Všechny kontejnery zůstaly healthy a zachovaly log limit 10 MiB × 3
s kompresí. Checksum migrace 0033 v produkci odpovídá zdroji
`d59feb580fad81efa0a88fd7621bfcdef3c14f44d9d2712a42937d19e4e87ecd`;
aplikační role má SELECT/INSERT nové receipt tabulky. Dříve zrušené termíny
Latino Ladies 6. 11. a 18. 12. zůstaly zrušené.

Veřejné stránky a sessions API vracejí 200. Obě nové admin akce bez přihlášení
vracejí 401 s ErrorResponse (error.code/message/requestId). Skutečná rezervace
při ověřování nebyla zrušena. Přihlášené produkční UI zatím není ověřené:
prohlížeč zůstal na přihlašovací stránce. Skutečný komponent formuláře prošel
na syntetických datech při šířce 360 px bez vodorovného přetékání, včetně
klávesnice, doprovodu, povinného důvodu prominutí, invalidace náhledu a potvrzení.
Kompletní aplikační sada měla 525 úspěšných testů; po přidání dvou regresí
prošla cílená sada 18 databázových testů (527 různých aplikačních testů celkem).
Lint, typecheck, build, repo/contract/analytics gates a skeleton prošly.

## Bezpečnostní aktualizace 2026-10-27 — čeká na kapacitu

Oprava `ff76322` aktualizuje zranitelné knihovny dle dependency-audit.md.
Audit registru je bez nálezů, kompletní `pnpm check` s lokálním PostgreSQL
prošel (527 aplikačních testů). Standardní produkční nasazení tohoto SHA
27. 10. odmítla kapacitní brána: na / bylo přibližně 15 GiB místo potřebných
20 GiB. Nebyla obejita ani změněna; produkční API/web/worker zůstávají na
zdravé revizi `54216e8`. Kandidátní obrazy a jejich scans dosud nebyly vytvořeny.
Po uvolnění alespoň 20 GiB znovu spustit `pnpm deploy:production -- ff76322`,
vyžádat úspěšné scans všech tří obrazů a přesné runtime/readiness ověření.
Sdílené cache, cizí aplikace ani volumes nebyly mazány. X5 je připojené,
volných bylo přibližně 38 GiB. Dočasná testovací databáze neobsahovala
produkční data a po testech se odstraňuje.

### Schválená kapacitní politika 2026-10-27

Vlastník výslovně schválil limity 15/10 GiB: před sestavením vyžaduje
`scripts/check-deployment-disk.py build` nejméně 15 GiB na /. Po sestavení
a všech image scans, ještě před `compose up`, vyžaduje fáze `activate`
nejméně 10 GiB. Neúspěšné měření i nedostatečná kapacita nasazení zastaví;
před aktivací zůstává běžící verze nedotčená. Schválení nahrazuje původní
pevnou hranici 20 GiB pro budoucí nasazení. Rezerva paměti 2 GiB, X5 UUID,
rezerva X5 5 GiB, skeny, operation locks a rollback zůstávají zachované.
Snížení rezervy zvyšuje riziko souběžného růstu ostatních služeb; nejde
o oprávnění čistit sdílené cache, volumes nebo cizí aplikace.

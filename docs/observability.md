# Observabilita

## Status a cíle

Observability stack zatím není vybrán. OpenTelemetry je výchozí standard. Cílem
je rychle odpovědět: funguje rezervace, je správná kapacita, odcházejí důležité
zprávy, kde se request zpomalil a kterou verzi je třeba vrátit.

## Strukturované logy

Povinná pole každého backend/worker logu:

```text
timestamp, level, service, message, requestId, environment, version
```

Podle kontextu:

```text
traceId, spanId, userId, adminId, operation, entityType, entityId,
durationMs, errorCode, jobId, notificationType, channel, attempt
```

Pravidla:

- JSON v runtime, lidsky čitelný formát pouze lokálně;
- request ID vznikne na edge/API nebo se bezpečně přijme/normalizuje;
- jeden request ID se propaguje do DB/outbox/job logů;
- logy neobsahují hesla, tokeny, cookies, authorization header, provider key,
  plné e-mailové payloady, interní volné poznámky ani zbytečné PII;
- klientská chyba může zobrazit request ID pro podporu;
- audit log není náhradou aplikačního logu a naopak.

## Omezené produkční logy kontejnerů

Produkční web, API, worker i jednorázový migrátor používají Docker `json-file`
s `max-size=10m`, `max-file=3`, `compress=true`. Limit platí pro každý kontejner
samostatně (přibližně 30 MiB, plus režie); nejde o časovou retenci ani omezení
objemu zápisů. Starší diagnostické soubory Docker automaticky odstraní.
`docker logs` zůstává dostupné. Databázová auditní evidence, uživatelská data
a identity/DMZ logy mají samostatná pravidla a tato změna je nemaže.

Stejná politika je v produkčním Compose i sdíleném `storage-compose.yml`, který
používá nasazení, rollback a servisní změny médií/registrací. Nové nastavení
vyžaduje znovuvytvoření kontejneru; samotný restart ho neaktivuje. Nepřepisovat
historické releasy ani globální Docker daemon. Před přechodem existující logy
uchovat přes `docker logs --timestamps` v soukromém komprimovaném archivu na
ověřeném X5; archiv nezaměňovat za úplnou právní nebo auditní evidenci.

## Metriky

### API a infrastruktura

- request count/rate podle route template, method, status a service;
- duration histogram a 5xx/4xx rate;
- DB pool saturation, query duration a transaction retry/deadlock;
- CPU, memory, restart, event-loop/runtime saturation;
- S3 gateway/bucket availability, request latency/error, kapacita a stáří
  poslední ověřené zálohy;
- media delivery/cache a externí provider latency/error;
- Keycloak discovery/login/logout latency/error, session validation failure a
  dostupnost produkčního issueru;
- deploy/version a readiness stav.

### Rozlišení výpadku identity a neplatné relace

API `request_failed` s `errorCode=IDENTITY_PROVIDER_UNAVAILABLE` a HTTP 503
znamená dočasné odmítnutí ověření; server zachoval relaci a případnou novou
šifrovanou refresh credential. Neznamená špatné heslo ani dokončenou revokaci.
Web při nemožnosti zahájit/recyklovat přihlášení zapisuje
`oidc_operation_failed` s operací `client_login_start` nebo
`admin_login_start` a request ID; jeho obecný `OIDC_START_FAILED` sám příčinu
nerozlišuje. Při šetření korelovat stav interního session endpointu, API kód a
dostupnost Keycloaku. Nežádat po uživateli OTP reset kvůli provider 503.

`AUTHENTICATION_REQUIRED` na interní session endpoint je odmítnutý serverový
podpis včetně replay/změny těla; po release zkontrolovat soulad web/API revizí
a `rawBody: true`. Vyčerpání omezené replay cache vrátí 503
`SERVICE_UNAVAILABLE`. Definitivně zrušená relace se při resolve vrátí jako
neplatná. ADR 0027 doplňuje uložený první důvod a strukturovanou provozní
událost zneplatnění; starší záznam bez důvodu zůstává neznámý. Absence logu
není důkaz úspěšného ověření ani výpadku.

Provozní šetření sleduje latency token/JWKS endpointu proti osmisekundovému
limitu, DB čekání na session řádek, aplikační pool saturation a opakované 503.
Souběžné ověření má limit 50 různých session na proces, nonce cache 10 000
živých položek. Tyto limity nejsou samostatně exportované metriky; dashboard
je nesmí vydávat za zavedené měření. Žádný diagnostický log nesmí obsahovat
HMAC, nonce, tělo interního requestu, cookie, JWT, refresh token ani client
secret. Nové fetch limity ani odstranění opakovaných session zápisů nesnižují
povinné admin MFA.

### Diagnostické události relací (CD-069 / ADR 0027)

`application_session_revoked` vznikne až po úspěšném commitu prvního
zneplatnění. Nese netajné `sessionId`, `kind`, pevný `reason`, případně
vymezený `detail` a obvyklá provozní pole včetně request ID.
`application_session_revalidation_unavailable` je varování s vymezenou
fází/typem selhání a případně HTTP stavem; neznamená zrušení relace.

Web zaznamenává jen explicitní auth operace:
`admin_interactive_login_required` (vymezené stavy cookies a požadavek
zapamatování), `application_session_cookie_issued` (browser_session nebo
remembered_90_days), `application_session_cookie_cleared` (explicit_logout
nebo callback_failed). Není to souvislé sledování prohlížeče ani potvrzení
příčiny ztráty cookie. Request ID propojuje webový auth request s interním
podepsaným voláním API. Důvody nejsou veřejnou API odpovědí, statistikou
VCode nebo textem pro koncového klienta.

### Doména rezervací

- booking attempts a outcomes: success, full, closed, duplicate, invalid;
- cancellation outcomes: on-time, late, conflict;
- concurrency/serialization retry count;
- fee creation/settle/waive agregovaně, bez finanční „online payment“ metriky;
- session change/cancel count a počet dotčených rezervací interně;
- outbox oldest age, pending count a processing failure.

Veřejná analytika ani telemetry nesmí zpřístupnit počet volných míst klientovi.

### Oznámení

- scheduled/sent/failed/cancelled podle channel/type;
- retry count a oldest pending age;
- provider reject/bounce;
- doba od doménové změny k úspěšnému odeslání;
- permanent failure důležitého zrušení/změny.

### Webový frontend

- frontend crash/error rate podle verze a surface;
- Web Vitals/LCP/INP/CLS pro veřejný web;
- načtení rozvrhu a booking latency z pohledu klienta;
- nejasný booking timeout a následná kontrola účtu;
- frontend exception rate a API failure podle veřejné/klientské/admin plochy.

Produktová analytika a provozní telemetry jsou oddělené. Produktové eventy se
zapnou až po privacy/consent rozhodnutí.

## Tracing

Trace má spojit edge/web server, API, booking transaction, outbox a worker.
Externí e-mail span neobsahuje tělo zprávy. Sampling je vyšší pro chyby a
kritické booking/notification flow, ale respektuje náklady a privacy.

## Health a readiness

- `/health`: pouze liveness procesu;
- `/ready`: povinná DB a inicializace; 503 při nemožnosti bezpečně přijímat
  provoz;
- asynchronní provider výpadek může být degraded místo not-ready, pokud je
  zpráva bezpečně uložena a existuje alert;
- web readiness se ověřuje syntetickým smoke mimo samotný endpoint.

## Alerty – návrh

| Priorita | Podmínka | Očekávaná reakce |
| --- | --- | --- |
| P1 | booking API je nedostupné nebo systematicky porušuje konzistenci | okamžitě on-call, případně stop změnového provozu |
| P1 | DB unavailable, poškození dat, outbox se nezapisuje | okamžitá eskalace |
| P1 | zrušení/změna termínu se trvale nedoručuje e-mailem | ruční kontakt a oprava fronty |
| P1 | Keycloak nebo issuer je nedostupný a klienti/admini se nemohou bezpečně přihlásit | zachovat veřejné čtení, zastavit neautorizované změny a eskalovat identity službu |
| P2 | významný růst 5xx/latency, queue age nebo crash rate | šetření během provozní doby |
| P2 | záloha selhala nebo je starší než povolený limit | oprava a ověření obnovitelnosti |
| P3 | jednotlivý provider retry/bounce | agregovat a řešit trend |

Konkrétní prahy, on-call kanál a reakční časy jsou TBD. Alert bez vlastníka a
runbooku není připravený.

## Dashboardy

1. **Service overview:** traffic, error, latency, saturation, version, ready.
2. **Booking integrity:** výsledky, conflicts, DB retries, nejčastější codes.
3. **Notifications:** queue age, delivery, retries, provider failures.
4. **Client quality:** Web Vitals, frontend errors, API latency.
5. **Backup/operations:** backup age, restore test date, migration/deploy state.

Administrativní změna termínu zapisuje `session.updated` s počtem aktivních
rezervací, důvodem a starým/novým časem, typem lekce a instruktorem. Sjednocení
Barre zapisuje systémové události s `requestId=CD-050` pro každý změněný termín
a samostatnou událost `class_type.merged`.

## Retence a přístup

Log/trace/metric retence se stanoví podle privacy, provozní potřeby a nákladů.
Přístup je role-based; support nesmí automaticky získat databázový nebo secret
přístup. Export logů se považuje za citlivou operaci.

## Release gate

- [ ] nové kritické flow má log, metric a trace/correlation plán;
- [ ] error response obsahuje request ID a log jej zná;
- [ ] osobní a tajná data prošla redaction kontrolou;
- [ ] health/readiness odpovídají skutečné závislosti;
- [ ] kritické alerty mají vlastníka a odkaz na `runbook.md`;
- [ ] dashboard rozliší aktuální a předchozí verzi při rollout/rollbacku.

## Změna rozvrhu a portréty

CD-044 zapisuje `session.rescheduled` s původním a novým časem, časovou zónou
a bezplatným storno oknem; nově zveřejněné středy mají `session.created`.
Admin změna týmu zapisuje `team.updated`; změna profilu zachovává
`instructor.updated`, upload `media.uploaded`. Všechny záznamy mají request ID
a aktéra. Sleduje se chyba úložiště a stav outboxu; vložení e-mailu do outboxu
není důkaz o jeho doručení.

## Kontroly zálohy médií CD-046

`backup-media.sh` zapisuje strukturovaný výsledek s počtem objektů, velikostí
a časem; `--check` kontroluje každou hodinu SHA-256 a stáří nejvýše 36 h.
Provozní log je `/home/voldzi/deployments/studio-balance/media-backup.log`,
poslední úspěch `media-backups/latest.json`. Neúspěšný běh vrací nenulový kód
a nezmění poslední úspěšný manifest. Před zálohou se kontroluje rezerva 5 GiB
na cílovém disku. Log a návratový kód jsou připravené pro centrální alerting;
externí doručování upozornění tímto krokem nevzniká.


Studio opening changes produce studio.opening.requested audit entries with admin subject and request ID. Pending registrationSynced=false is visible in admin and retried; never log identity tokens or credentials.

Worker pravidelného rozvrhu zapisuje `weekly_schedule_generated` s počtem
vytvořených a přeskočených termínů, nebo `weekly_schedule_failed` s důvodem.
Provozní kontrola sleduje čas posledního úspěšného běhu a nejpozdější budoucí
termín. Opakovaná chyba nebo horizont pod 30 dní vyžaduje zásah. Aktivace a
pozastavení pravidla se audituje jako `weekly_schedule_rule.updated` s admin
subjektem; cenu Barre dokládá `session.price_changed`. Logy nesmí obsahovat
jmenný seznam klientů ani jejich kontakty.

Hromadná změna ceny zapisuje `class_type.price_changed` se souhrnnými počty,
`weekly_schedule_rule.price_changed` a `session.price_changed` s původní a
novou cenou. Jen při výslovné změně potvrzené rezervace vzniká
`booking.price_corrected` a zpráva v účtu. Události obsahují admin subjekt a
request ID, nikdy e-mail ani jméno klienta. Odmítnutý zastaralý náhled je
provozní konflikt, nikoli částečně provedená změna.

Změna pravidelného času zapisuje `weekly_schedule_rule.updated` s původními
a novými parametry a `session.updated` pro každý upravený budoucí termín.
Metadata obsahují počty rezervací, nikoli jména. Při změně času nebo lektora
se sleduje doručení `session_changed` z outboxu; samotný zápis do outboxu
není potvrzení doručení. Konflikt nebo zastaralý náhled nesmí zanechat
částečně upravený rozvrh.

## Audit změn rozvrhu

`weekly_schedule_rule.versioned` zaznamená předchůdce, datum od/do, vybrané
hodnoty, termíny a zachované výjimky. `session.capacity_changed` zaznamená
původní/novou kapacitu a počet rezervací; `booking.price_changed` explicitní
přecenění. requestId a admin subject navazují na existující audit.
Při konfliktním náhledu nevznikne částečný audit ani rozpracovaná verze.

### Účastníci rezervace

Každé místo má vlastní `booking.created` audit s participantKind, verzí podmínek
a příznakem přijetí odpovědnosti; jméno doprovodu není potřeba logovat.
Idempotentní replay nepřidává další audity ani oznámení. Sledujte SESSION_FULL,
BOOKING_ALREADY_EXISTS a IDEMPOTENCY_KEY_REUSED podle requestId bez osobních údajů.

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

Archivace typu a pozastavení rozvrhu používají existující administrativní audit class_type.updated a weekly_schedule_rule.versioned. Přímé požadavky na rezervaci neaktivního typu vracejí RESOURCE_NOT_FOUND se standardním requestId.

Storage separation, X5 mount guards, retention, recovery evidence and operational limits: [production storage](production-storage.md) (ADR 0024).

## Potvrzení lekce a výkazy instruktorů (ADR 0026)

V jedné transakci vznikají `booking.attendance_changed` pro skutečně změněná
místa a `instructor_lesson_record.confirmed` nebo
`instructor_lesson_record.corrected` pro výkaz. Audit obsahuje admin subjekt,
requestId, termín, důvod, předchozí/nové hodnoty a verzi; fee změna má zachovaný
původní stav a částku. Běžný log nemá kopírovat odměny, jména ani celý seznam.
Idempotentní opakování nepřidává audit ani další poplatek. Chyba auditu vrátí
celé potvrzení, nikoli jen část výkazu.

Provozní UI rozlišuje ukončené nepotvrzené lekce, chybějící odměny a
`attendanceChanged` po změně docházky. Tyto stavy nejsou potvrzenými tržbami,
neúspěšnými platbami ani automaticky vypočítanou odměnou. Měsíční souhrn se
počítá ze skutečně potvrzených výkazů; nepoužívá budoucí plán nebo očekávanou
docházku. Konflikt `INSTRUCTOR_RECORD_CONFLICT` korelovat přes requestId,
nevynucovat přepsání verze. Výkazy ani jejich exporty nepatří do veřejné analytiky.

## Návrhy recenzí (CD-072)

Sledovat běžné request počty/chyby a latenci podle šablony veřejné nebo
administrační cesty. Kódy validační chyby, odmítnutí originu, limitu 429,
konfliktu 409 a nedostupnosti DB 503 umožní rozlišit běžnou opravu formuláře
od problému služby. Neznamenají samy spam nebo ověřenou návštěvu. Log musí
zachovat timestamp/level/service/message/requestId/environment/version a
nesmí obsahovat jméno, text, hodnocení, consent payload, HMAC token, nonce,
surovou IP/síť nebo krátkodobý síťový otisk.

Moderace má minimální databázový audit s aktérem, ID návrhu/recenze, rozhodnutím,
časem a requestId, nikoli plný text nebo jméno klienta. Čas/verze souhlasu
zůstávají v neveřejném návrhu; neduplikují se do logu ani veřejných metrik.
Počet čekajících zobrazuje admin API, není klientskou ani VCode statistikou.
Nevytváří se nový analytický endpoint nebo vendor; formule, nové cesty a QR
jsou mimo veřejný tracker. Chybějící log není důkaz úspěšně přijaté recenze.

## Diagnostika obnovy přístupu

CD-073 nepřidává sběr klientských formulářů, reset tokenů ani nové veřejné
analytické události. Dedicated DMZ login access log používá pouze čas,
metodu, URI bez query, status, délku a request ID. Neobsahuje Referer,
cookie, authorization, IP ani user agent. Raw Nginx identity error log je
vypuštěný, protože neumí redigovat token v request URI; backendové události
a sanitized access failures zůstávají dostupné. Odeslání SMTP, doručení
a dokončení obnovy klientem se evidují odděleně. Dosavadní chráněné auth
logy se při změně nemažou a nová retence historických záznamů se tímto
rozhodnutím nezavádí.


## Odhlášení správcem

`booking.cancelled_by_admin` v application_audit nese správce, booking, requestId,
scope, reason, waiverReason, mode, feePolicy a feeCents. Jde o neveřejný databázový
audit, ne událost veřejné analytiky. Důvody a jména se nepřidávají do provozních
logů. Síťovou chybu korelovat requestId a stavem rezervace; replay receipt potvrzuje
commit bez druhého účtování. Neukládat cookie ani token náhledu do chatu/logů.

# Testovací strategie

## Cíl

Testy dokazují hlavně správnost rezervace, času, autorizace a komunikace – ne
jen render happy path. Scaffold používá Vitest pro unit/API testy, Fastify
`inject` pro HTTP kontrakt a `pnpm check` jako souhrnnou lokální/CI bránu.
Component/E2E a automatizovaný accessibility nástroj se vyberou s prvním
interaktivním workflow; scénáře a release gate jsou závazné už nyní.

## Stav ověření zákaznického preview (2026-08-04)

- doménové unit testy pokrývají dostupnost a přesnou 24hodinovou hranici;
- lokální PostgreSQL 18 smoke prošel pro doplnění profilu, vytvoření rezervace,
  opakování se stejným idempotency key, výpis, cancellation preview a včasné storno;
- browser smoke prošel pro veřejný úvod, rozvrh, přepnutí dne, detail termínu a
  návrat z chráněné rezervace do přihlášení se zachovaným cílem;
- vizuální kontrola prošla na 1536 × 1024 a 390 × 844, bez horizontálního
  přetečení a bez číselné kapacity; důkaz je v `design-qa.md`;
- preview neposílá e-maily skutečným adresátům; vytváří pouze interní zprávu v
  účtu. E-mailové TC zůstávají release gate před ostrým provozem.

Automatizovaný DB concurrency test posledního místa, plný Keycloak browser E2E,
e-mail, administrace, S3 média a reálná zařízení zůstávají předprodukčními
branami; zákaznické preview je nesmí vydávat za uzavřené.

Řez recenzí ověřuje veřejné čtení bez přihlášení, oddělenou administrátorskou
autorizaci, odmítnutí publikace bez souhlasu, volitelné skutečné hvězdičky a
audit vytvoření/úpravy. Migrace neobsahuje žádné ukázkové reference; prázdný
stav proto nesmí zobrazit vymyšlenou citaci.
Admin formulář po validační chybě zachová rozepsanou skutečnou recenzi a
publikovaná vazba na skrytý nebo neexistující typ lekce nesmí vytvářet veřejný
odkaz vedoucí na 404.

## Vrstvy

| Vrstva | Co ověřuje |
| --- | --- |
| unit | čas/cutoff/arrival, stavové přechody, veřejná availability, preference |
| DB/domain integration | constraints, transakce, outbox, recurrence, fee uniqueness |
| API contract | OpenAPI, schema, status/error, auth a idempotency |
| component | všechny UI stavy, formuláře, keyboard/focus a copy |
| end-to-end | kritické cesty veřejného/klientského webu a administrace proti test backendu |
| security | IDOR, role, CSRF/XSS, rate limit, reset, upload a secret leakage |
| performance/concurrency smoke | poslední místo, schedule read, booking latency |
| visual/accessibility | breakpointy, real device/browser, AA smoke a regrese |
| resilience/operations | provider failure, retry, backup/restore a rollback smoke |

## Povinné business scénáře

| ID | Scénář | Klíčový důkaz |
| --- | --- | --- |
| TC-01 | nový klient z mobilního webu | rozvrh anonymně, kontext po registraci, jedna rezervace, e-mail, bez platby |
| TC-02 | souběh o poslední místo | právě jeden úspěch, druhý `SESSION_FULL`, žádný overbook/waitlist/count |
| TC-03 | storno přesně 24 h před | `cancelled_on_time`, bez fee, kapacita uvolněna |
| TC-04 | storno 23:59:59 před | varování, potvrzení, `cancelled_late`, právě jeden fee |
| TC-05 | no-show | admin akce, fee ze snapshotu, settle/waive + audit |
| TC-06 | zrušení studiem | `cancelled_by_studio`, žádný fee, nové booking blokovány, zprávy |
| TC-07 | změna času | stará/nová hodnota, nový arrival/cutoff/reminders, klient informován |
| TC-08 | DST | lokální čas, offset, cutoff a reminders správné na obou přechodech |
| TC-09 | změna obsahu | veřejný web i klientský účet vidí změnu bez aplikačního release |
| TC-10 | přístup k cizí rezervaci | zamítnuto bez úniku, bezpečný log/request ID |

## Hraniční matice storna

Pro session začínající v instantu `T`:

| Aktuální čas | Výsledek |
| --- | --- |
| `T - 24h - 1s` | on-time |
| `T - 24h` | on-time |
| `T - 24h + 1s` | late |
| těsně před `T` | late |
| po `T` | podle rozhodnutí OQ-007; nesmí se tiše chovat jako on-time |

Testy používají fixované hodiny, ne skutečný wall clock. Pokrývají UTC offset
zimní/letní, změnu termínu a případné ambivalentní/neexistující lokální časy.

## Kapacita, duplicity a idempotence

Povinné:

- N souběžných requestů na jednu zbývající kapacitu → právě jeden nový booking;
- žádný transient stav nepřekročí kapacitu ani po retry/deadlock;
- dvojklik se stejným idempotency key → stejný response/booking;
- stejný key s jiným payloadem → bezpečný konflikt;
- odlišný key stejný user/session → `BOOKING_ALREADY_EXISTS`;
- retry po timeoutu po commitu → klient zjistí již existující booking;
- včasné storno uvolní veřejnou dostupnost, ale nespustí waitlist;
- cancelled booking a definice „active“ jsou konzistentní s DB constraintem.

Test musí běžet proti stejné databázové technologii a isolation/locking modelu
jako produkce; in-memory mock není důkaz transakční správnosti.

## Stavové a fee testy

- všechny povolené přechody a odmítnutí všech nepovolených;
- repeated late cancel/no-show nevytvoří druhý fee;
- amount je snapshot ceny session v okamžiku rezervace nebo výslovně definované
  verzi; pozdější změna ceníku nepřepíše historický fee;
- studio cancel nikdy nevytvoří fee a zruší neplatné pending remindery;
- settle/waive/cancel vyžaduje oprávnění, důvod a audit;
- administrativní correction zachová historii, actor a request ID.

## API a kontrakt

- `/health` 200; `/ready` 200/503 podle stavu závislostí;
- každá response odpovídá `openapi/openapi.json`;
- každá chyba používá `ErrorResponse` a bezpečné `requestId`;
- veřejná session schema neobsahuje interní capacity/remaining/client data;
- role a objektová autorizace pro každou `me/admin` cestu;
- pagination/filters/invalid ranges mají deterministické výsledky;
- CSRF/CORS/cache headers odpovídají auth modelu;
- Keycloak issuer/audience/signature/expiry validace, jednoduchá klientská
  registrace bez e-mailového ověření a odhlášení mají pozitivní i negativní
  testy; existující účet se starou `VERIFY_EMAIL` akcí po konfigurační opravě
  neotevře obrazovku slibující nedostupný e-mail;
- admin bez MFA nesmí vstoupit do administrace; změna role nebo MFA reset se
  projeví v relaci a auditu;
- produkční konfigurační kontrola vyžaduje nejen AMR mapper, ale i reference
  `pwd` a `otp` na password/OTP executions obou browser flow; smoke z profilu
  do administrace po novém heslo+TOTP přihlášení nesmí vytvořit událost
  `ADMIN_MFA_REQUIRED` ani zobrazit druhý přihlašovací formulář;
- webová relace administrátora vzniklá po heslu a TOTP otevře správu i
  administrační API bez dalšího zadání na zapamatovaném zařízení nejvýše 90 dní
  při aktivitě aspoň jednou za 30 dní; stejná role bez podepsaného AMR `otp`
  musí skončit `MFA_REQUIRED` / přesměrováním na záložní oddělené přihlášení;
  refresh ani pozdější přiřazení role nesmí hodnotu MFA povýšit;
- bez volby zapamatování je klientská cookie session-only; se zapamatováním má
  90denní absolutní a 30denní neaktivní limit. Browser token je neprůhledný,
  refresh token zůstává šifrovaný v databázi a po nejvýše 15 minutách se znovu
  ověřuje účet i role v Keycloaku; odhlášení zneplatní obě aplikační relace i
  jejich obnovovací tokeny;
- web, API a worker zůstávají kompatibilní během rollout/rollback okna.

## UI a přístupnost

Každá kritická obrazovka pokryje loading, empty, disabled, success, validation,
system error, permission denied a případný offline/stale stav. Povinný smoke:

- 360 px, tablet a desktop;
- mobilní veřejné menu obsahuje obecné cíle bez samostatné položky Balance
  Flow, obsahuje „Přihlásit / Můj účet“ a nepřihlášeného dovede na přihlášení
  bez ztráty návratu do účtu; otevřený panel se zavře klepnutím mimo něj,
  výběrem odkazu i klávesou Escape a po Escape vrátí fokus na ovladač menu;
- současné Safari iOS/macOS, Chrome Android/desktop, Edge, Firefox;
- keyboard-only, viditelný fokus a dialog focus restore;
- automated WCAG audit + ruční formuláře/live region/zoom/reduced motion;
- Keycloak login theme na přihlášení, registraci, obnově hesla, validační chybě
  a nastavení MFA při 360 px i desktopu; žádný horizontální scroll, useknutý
  formulář ani únik QR secretu do důkazu;
- žádný capacity count, waitlist, payment CTA nebo permanentka v DOM,
  accessible name, URL payloadu ani analytics eventu;
- schválené logo/fotografie, crop a layout bez překryvu/shiftu.
- PWA smoke: manifest obsahuje název, barvy a instalační ikony; service worker
  neinterceptuje API ani neukládá rozvrh, účet nebo rezervace; bez připojení
  navigace zobrazí pravdivou offline stránku; instalovaná aplikace už návod
  nezobrazuje, iOS dostane postup Safari a podporovaný prohlížeč instalační
  dialog. Když instalační dialog není dostupný, názvy položek menu se nesmějí
  tvářit jako nefunkční tlačítka stránky.
- produkční OIDC smoke ověří, že klientské i administrátorské zahájení
  přihlášení vrací přesměrování na veřejný Keycloak; test používá i skutečný
  tvar dynamických backchannel metadat s interními token a JWKS endpointy a
  odmítne endpoint mimo veřejný issuer a přesně nakonfigurovaný backchannel;
- profil přihlášeného účtu otevře zesílenou Keycloak akci pro změnu vlastního
  hesla a po dokončení se bezpečně vrátí do profilu; heslo ani token se
  neobjeví v URL, logu ani JavaScriptu aplikace;
- administrační dashboard počítá oblíbenost, osmitýdenní docházku, měsíční
  neúčasti a odhad hodnoty návštěv z aktuálních stavů rezervací; prázdná data
  mají čitelný stav, hranice týdnů používá Europe/Prague a odhad ceny se nikde
  nevydává za skutečnou tržbu;
- detail každé lekce na 360 px i desktopu: schválená fotografie nebo bezpečný
  fallback, sémantická náročnost 1–5 hvězdiček, praktické informace a odkaz na
  nejbližší termín;
- klientský účet po rezervaci ukáže potvrzení jen přihlášenému klientovi;
  nepřihlášený požadavek na zprávy vrací standardní `401` chybu.
- klientský účet na 360 px ukáže přivítání, nejbližší rezervaci s fotografií,
  přímé storno a spodní navigaci bez horizontálního přetečení; na desktopu
  zachová stejná data a akce;
- oblíbené jsou soukromé pro aktuální účet, idempotentně se přidají/odeberou a
  skrytý typ lekce se veřejně nevrací;
- novinky zobrazují jen publikované položky po čase zveřejnění; admin koncept,
  publikace a úprava vyžadují admin roli a zapisují audit.

## Oznámení

- confirmation/reminder/change/cancel se váže na správný booking a místní čas;
- 24h/2h/30m plán na obou DST obdobích;
- změna termínu zruší staré joby a vytvoří nové;
- cancellation zruší budoucí reminders;
- retry je idempotentní a neprodukuje nekontrolované duplicity;
- permanent e-mail failure důležité změny vyvolá alert/ruční fallback;
- odkaz z e-mailu otevře správný objekt po loginu i bez aktivní session;
- marketing preference neblokuje provozní komunikaci a naopak.
- rezervace vytvoří právě jedno potvrzení a pouze budoucí výchozí připomínky v
  outboxu; při stornu se čekající úlohy označí jako zrušené;
- bez nakonfigurovaného e-mailového poskytovatele nesmí žádná úloha přejít do
  stavu `sent`.

## Admin, CMS a média

Proměny před/po mají testovat: koncept bez souhlasu, odmítnutí publikace bez
souhlasu, dvě různé fotografie, skrytí z veřejného API, pořadí, vazbu pouze na
aktivní lekci, audit a `private, no-store` administrační odpověď. Upload ověřuje
JPG/PNG/WebP do 8 MB, odmítnutí jiného či poškozeného obsahu, odstranění EXIF,
limit rozměrů, nedostupné S3 a zákaz veřejného čtení osiřelého objektu. UI se
ověří od 360 px, klávesnicí a s nápovědou otevřitelnou fokusem.

- recurrence create/edit/exception/cancel bez hardcodovaného rozvrhu;
- preview dopadu významné změny;
- administrativní úprava termínu předvyplní aktuální hodnoty, nabízí jen aktivní typy pro nový termín a při změně zachová rezervace, storno okno, připomínky a audit;
- obsahová změna se projeví veřejnému webu i klientskému účtu bez release;
- publish/unpublish/order a audit;
- upload type/signature/size/dimensions/malware a nebezpečné SVG/rich text;
- CSV export má autorizaci, escaping, encoding a ochranu proti formula injection;
- privacy export/smazání/anonymizace podle schválené retence.

## Výkon a odolnost

Konkrétní SLO prahy jsou TBD, ale před produkcí se provede:

- schedule read na realistickém týdnu a cache miss/hit;
- burst booking na stejný session;
- velký admin seznam/export v definovaném limitu;
- výpadek DB, e-mailu a storage;
- S3 permission denial, nedostupnost, zaplnění a chybějící objekt bez dopadu na
  rezervace;
- worker restart uprostřed jobu;
- restore backupu a následné invariant checks;
- rollback předchozího artefaktu s kompatibilní DB.

## Testovací data

Používat syntetické české profily, deterministické UUID a explicitní timezone.
Žádné produkční e-maily/telefony/fotografie v CI. E-mail sandbox nesmí
kontaktovat reálné klienty. Seed rozlišuje běžný, full, closed, cancelled,
historický a DST termín.

Lokální integrační testy běží proti PostgreSQL 18 v Docker Desktop. Verze a
relevantní connection semantics musí odpovídat produkčnímu PostgreSQL za
`haproxy.home.cz:5000`; testy se nikdy nepřipojují k produkční databázi.
Lokální S3-kompatibilní služba běží také v Docker Desktop s testovacím bucketem
a credentials. Test nikdy nezapisuje
do produkčního bucketu na `docker.home.cz`.
Identity testy používají projektový lokální Keycloak stejné hlavní verze a
syntetický realm; nikdy se nepřipojují k produkčnímu realmu.

## Traceability a report

Testy mají v názvu nebo metadatech ID `INV/WEB/IDN/BKG/CAN/NTF` a `TC` z
`requirements.md`. Akceptační report uvádí prostředí, verzi, zařízení/browser,
výsledek, důkaz a známou výjimku. Screenshot bez assertion není test.

## Pre-merge gate

Po vytvoření stacku: install, lint, typecheck, unit/integration/contract,
relevantní component/E2E, build, skeleton validation, OpenAPI lint/diff,
secret scan a dependency scan. PR musí výslovně uvést neprovedenou kontrolu.

## Release gate

- [ ] všechny P0 requirement a TC scénáře prošly;
- [ ] concurrency/idempotency/DST test běžel na produkčně ekvivalentní DB;
- [ ] authorization a privacy negativní testy prošly;
- [ ] podporované desktopové i mobilní browsery na reálných zařízeních prošly smoke;
- [ ] záloha/obnova a rollback byly prakticky ověřeny;
- [ ] žádná kritická/vysoká vada a známé nižší vady mají ownera/rozhodnutí;
- [ ] akceptaci lze reprodukovat z verzovaného reportu a artefaktu.

## CD-044 / CD-045 – portréty a středeční Barre

`studio-people.integration.test.ts` používá výhradně lokální PostgreSQL a
vlastní dočasné schéma. Aktivuje se proměnnou `STUDIO_TEST_DATABASE_URL`;
bez ní je výslovně přeskočený. Příklad pro Docker Desktop:

```bash
STUDIO_TEST_DATABASE_URL=postgresql://studio_balance:local-development-only@localhost:5433/studio_balance pnpm --filter @studiobalance/api exec vitest run src/database/studio-people.integration.test.ts
```

Kontroluje přesun rezervovaného termínu, ID a cenu rezervace, storno hranici,
bezplatné okno, nahrazení připomínek, idempotenci, souběh se zámkem rezervace,
rollback kolize, historii,
výjimky, zimní/letní čas a portréty u Jumpingu i bez budoucích termínů. Ověří
také centrální úpravu fotografií a odmítnutí assetů z jiného účelu.
Hromadné změny rozvrhu ověří výběr pouze budoucích naplánovaných termínů,
správný den a čas v Europe/Prague včetně změny letního času, rollback při
kolizi, zrušení bez poplatku a zachování rezervace, oznámení i auditu při
přesunu.
API testy týmu ověřují veřejný kontrakt, prázdný stav, validaci, admin MFA
a zákaz veřejného čtení nepřiřazeného uploadu. Komponentové testy ověřují oba
instruktory Jumpingu, fallback bez fotky a úplnou skupinovou fotografii.
Ruční kontrola zahrnuje 360 px, tablet, desktop, klávesnici, chybějící obrázek
a cesty rozvrh → detail → rezervace a katalog → detail → termín.

## S3 provozní ověření CD-046

Provisioning kontroluje omezení na vlastní bucket, read-only zálohovací účet,
odmítnutí anonymního čtení a verzování. V nasazené aplikaci se ověří skutečný
`MediaStorageService.prepareImage/put/get` se syntetickým neveřejným objektem
`_checks/backup-restore-source.webp`. Po záloze na docker hostiteli se tento
objekt smaže a obnoví pod dočasným klíčem výhradně ze záložního souboru;
porovnává se SHA-256 a dočasná obnovená kopie se smaže. Test nepublikuje obsah
ani nevytváří uživatelskou relaci. Přihlášené UI nahrávání je samostatný
akceptační průchod; samotný storage test jej nenahrazuje.


CD-047/048 checks: closed/open booking gate, concurrent close versus booking, successful idempotent replay while closed, admin authorization and invalid body, Keycloak sync success/failure/recovery, no-store status. Existing DST, 24-hour cancellation and fee checks remain required. Mobile install guide opens on first click after menu closes, traps focus, closes with Escape and returns focus to Menu.

CD-055/056 checks: generátor vytvoří jen chybějící termíny do tří kalendářních
měsíců a opakovaný i souběžný běh nevytvoří duplicity. Zrušený a ručně vložený
termín blokuje opětovné vytvoření; pozastavené pravidlo negeneruje, zatímco
existující termíny nemění. Při kolizi instruktora/místa se transakce vrátí.
Místní čas Barre 8:00 zůstane stejný před i po změně času; pátek a neděle
obsahují Power Yogu, sobota nic. Budoucí Barre stojí 270 Kč; podle CD-057
se aktivní rezervace budoucího Barre jednorázově upraví také na 270 Kč,
zatímco historické rezervace zůstanou beze změny. Nové termíny Balance Flow
stojí 160 Kč a existující rezervace zachovají původní snapshot. Test
`autumn-prices.integration.test.ts` ověří obě varianty, audit, oznámení
a atomické odmítnutí změny při již splatném poplatku. Admin vidí jména a počet po otevření konkrétního
termínu; klientský web tyto údaje nikdy nevrací. Ověřit admin MFA, 401/403,
`private, no-store` a mobilní šířku 360 px. Druhá jmenovitá admin relace
se ověří až při pozdějším výslovném zřízení dalšího účtu.

Správa cen celé lekce musí ověřit náhled a zastaralý token, souběh s vytvořením
rezervace, změnu pravidel a budoucích termínů, zachování historických dat,
výchozí zachování snapshotu, výslovnou změnu rezervace s auditem a oznámením,
odmítnutí splatného poplatku a klientské zobrazení původní ceny rezervace.

Úprava pravidelného času musí ověřit admin MFA a validaci, náhled a zastaralý
token, změnu dne/času přes Europe/Prague a DST, zachování ID a ceny rezervace,
oznámení, aktualizaci storno hranice a připomínek, propojení s generátorem,
odmítnutí kapacity pod počet přihlášených, duplicit a kolizí. Minulé a
individuálně změněné termíny zůstanou nedotčené.

## Admin účinnost rozvrhu (ADR 0018)

Lokální PostgreSQL testy ověřují navazující verze, původní pravidlo,
nezměněné rezervace při kapacitě, souběžně změněný náhled, náhradu typu
s bezplatným oknem, explicitní obnovu bez oživení rezervací, uzavření nových
rezervací, konec období, storno bez fee, explicitní přecenění a ochranu fee,
zachování individuálních výjimek a odmítnutí kapacity pod přihlášené.
UI smoke: otevření editace, nový týden a návrat z docházky, výběr více lekcí,
náhled změny, mobil 360px, klávesnice a návrat konceptu po přihlášení/reloadu.

Obnova identity: podepsaný testovací token musí použít interní token/JWKS
cestu při zachování veřejného issueru a audience. Token s cizím issuerem
se odmítne. Revokace používá tutéž interní cestu.

### Doprovod (CD-062)

Testovat skutečné transakce v izolované lokální PostgreSQL: atomickou dvojici,
souběžný boj o poslední místa, idempotentní replay i změnu payloadu, limit
jednoho doprovodu, neplatný souhlas/jméno, samostatné storno v přesné 24h hranici
včetně DST, dvě samostatné ceny/poplatky vlastníka, neúčast a zrušení studiem,
a odmítnutí cizího ID. HTTP kontrakt ověřuje přihlášení a validaci.
UI ověřuje mobilní formulář, cenu dvou míst, explicitní souhlasy, stav chyby,
úspěch dvojice a správné jméno ve stornu/admin docházce.

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

Lesson replacement checks reject missing/same-type targets including restored
drafts and mixed selections. Public lesson media denies unreferenced assets
before storage access and exposes only exact active catalogue references.

Uploaded lesson-image acceptance: check the public catalog, lesson detail and
account favorites load `/api/v1/media/{id}` directly, without routing through
Next image optimization. Confirm both poster and instructor portrait decode.

Regrese CD-065: deaktivace typu skryje katalog, profil, termíny a veřejný detail; přímá nová rezervace je odmítnuta. Již vytvořené rezervace a jejich seznam v účtu zůstávají zachované. Ověřuje PostgreSQL test booking-companion.integration.test.ts.

Veřejný katalog a rozvrh včetně detailů vrací Cache-Control: no-store, aby CDN po změně lekce neuchovávala starou nabídku. Kontrola hlavičky je v schedule.controller.test.ts. Při již existující CDN cache je nutné ověřit obnovu veřejné odpovědi.

Storage separation, X5 mount guards, retention, recovery evidence and operational limits: [production storage](production-storage.md) (ADR 0024).

CI runs a mandatory database integration gate using only its disposable local
PostgreSQL 18 service (`studio_balance_ci`).
`node scripts/test-database-integration.mjs` requires an explicit
STUDIO_TEST_DATABASE_URL, a loopback host and a dedicated studio_balance_ci/test
database name. Missing connectivity, wrong PostgreSQL version or missing test
files fail rather than silently skip. The fixture prepares pgcrypto once and
runs all integration test files serially; production configuration is never
inferred or loaded.

Operational regression checks cover unhealthy/stale/mismatched container
revisions, absence of a worker first successful generation, atomic tool
publication preserving already-open readers, incomplete/symlinked candidates,
wrong inherited lock inode/concurrent lock contention, and corruption or missing
objects in an older verified backup anchor even when the latest copy is intact.
Worker tests cover missing, malformed, expired, future and wrong-version markers.
The existing wrong-X5-UUID guard test remains mandatory. These checks do not
constitute production deployment or an independent disaster recovery exercise.

## Regrese bezpečnosti a výkonu po auditu 7. 10. 2026

- auth: přesné návratové URL, body-bound HMAC, chybějící raw body, opakovaný
  nonce, privátní cache, výpadek token/JWKS endpointu, rotace refresh tokenu,
  odebrané oprávnění, povinné MFA a omezení session locků;
- skutečná lokální PostgreSQL: zaplněný termín i po docházce, souběh se zámkem
  termínu, selhání auditu s rollbackem, stránkování se shodnými timestamps a
  mikrosekundami, izolace vlastníka, datumové filtry přes Prague DST, přepsání
  přísnějšího role idle transaction timeoutu aplikačním Poolem;
- média: skutečný JPG/PNG/WebP, odstranění metadat, odmítnutí SVG, dokumentu,
  prázdného/poškozeného/nadměrného obsahu a HTTP publikace200 -> stažení404
  bez cache a dalšího storage read;
- web: čerstvý nonce, přepsání podvrženého nonce, HTML CSP a frame denial,
  veřejný interní namespace404, stránkování s loading/empty/error stavy,
  schválená analytika se zachovanými DNT/GPC/offline/session guards;
- publikace: Nginx komprimuje pouze veřejný rozvrh, zachovává privátní
  analytický include a odmítá jeho chybění před změnou produkční konfigurace.

`pnpm check` neprokazuje publikaci na produkci ani přijetí na skutečném
telefonu. Závěrečný záznam musí odlišit lokální testy, build, CI/image scan,
produkční verzi a autentizovanou browser/PWA akceptaci.

### Povinná funkční kontrola Nginx

Linux CI vedle unit testu `python3 infra/nginx/test-hardening.py` instaluje
Nginx a vždy spustí `python3 infra/nginx/test-hardening-runtime.py`. Gate
nesmí přeskočit chybějící Nginx a samotné `nginx -t` nestačí: exact child
location bez vlastního `proxy_pass` má validní syntaxi, ale vrací statickou
404. Runtime test tuto chybu reprodukuje a ověří její opravu skutečnou proxy
odpovědí 200 a gzip. Také při globálně zapnutém gzip ověří velké privátní
API tělo i detail termínu bez komprese, přepsání podvržené IP a interní 404.
Příchozí hlavička `Via` musí být součástí regrese: reprodukuje vypnutí gzip
pod výchozí proxy politikou a ověří opravu pouze veřejného exact endpointu,
stejný rozbalený obsah a zachování privátního API i detailu bez komprese.
Používá jen syntetický loopback upstream, dočasnou vlastní konfiguraci a
vlastní Nginx proces; produkční konfiguraci, certifikáty ani existující službu
nenačítá. Na vývojovém Macu není instalace Nginx požadovaná. Po změně edge
pravidel se navíc musí ověřit skutečné veřejné HTTP odpovědi po nasazení.

## Production image gate regression

`python3 scripts/test-production-image-scan.py` runs the real shell gate
against private temporary paths and fake Docker, never a production daemon.
It verifies all three scans, pinned scanner identity, container restrictions,
absence of Docker socket/environment mounts, missing-X5 refusal before writes,
real file-lock contention, tag changes, HIGH findings, scanner failure, empty
or mismatched/incomplete reports, symlink refusal and own-workspace cleanup.
Cache tests verify the explicit 14-day/2-GiB idle reset boundary and refusal
to adopt or delete unmanaged/symlinked contents.
This regression test does not substitute for scanning the built release.

## CD-066–068: potvrzení lekce, výkazy a přímá klientská navigace

Závazné scénáře nového řezu; jejich seznam není tvrzením o dokončené
produkční nebo fyzické PWA akceptaci:

- Skutečný PostgreSQL: společné potvrzení označí jen `reserved` místa,
  vynechá storna a zachová dříve potvrzené stavy; vlastní místo a doprovod
  mají nezávislou účast. Výkaz, attendance, fee i audit se buď uloží všechny,
  nebo při chybě některé části nevznikne nic.
- Souběh se stornem, novou rezervací, změnou docházky či výkazem odmítne
  zastaralý `rosterToken`/`expectedVersion`. Test obsahuje poslední stav
  seznamu a nedovolí automatické potvrzení nově změněných účastníků.
- Totožný retry po commitu vrátí tentýž výkaz a nepřidá audit nebo poplatek.
  Jiný obsah se zastaralou verzí nesmí uspět jako idempotentní opakování.
- Budoucí, zrušený či neexistující termín se nepotvrdí. Skutečný čas má
  validní kladnou délku, nesmí skončit v budoucnosti; záskok se uloží
  skutečnému instruktorovi a oprava má důvod, staré/nové hodnoty a verzi.
- Neúčast vytvoří jeden fee ze snapshotu. Oprava na účast zruší pouze
  neuhrazený `due`; již `settled`/`waived` zachová včetně částky a úhrady.
  Opačná oprava obnoví původní zrušený fee bez změny snapshotu. Retry a
  skutečný souběh oprav nesmí vytvořit dvojí poplatek.
- Měsíční výkaz počítá pouze potvrzené lekce a skutečné minuty; budoucí či
  zrušené termíny se nezapočítají. Pokryty jsou oba měsíční okraje v
  `Europe/Prague` a měsíce přechodu DST. Historie se nemigruje odhadem.
- `rewardCents=null` je k doplnění, explicitní 0 je zadaná částka. Souhrn
  uvádí neúplné odměny. Změna docházky po potvrzení vrátí
  `attendanceChanged`; nezmění automaticky ruční odměnu ani schválenou částku.
- Neautentizovaný klient, klient bez role a admin bez MFA nečtou ani
  nezapisují výkazy; odpovědi mají kontrakt, requestId a soukromé cache
  hlavičky. Export neobsahuje kontakty klientů a escapuje CSV vzorce.
- Formulář a výkazy: pending/error/stale/permission/empty/success, viditelný
  důvod a neúčastníkův fee před uložením, záskok, ruční doplnění odměny,
  tisk/CSV právě zvoleného měsíce a čitelné upozornění na neúplnost.
  Nepotvrzené lekce a chybějící odměny mají počet i v exportu/tisku, nikoli
  pouze ve sbaleném nebo pro tisk skrytém seznamu obrazovky.
- Klientská lišta na účtu i rozvrhu má shodné položky a aktivní stav
  Rozvrh/Rezervace/Novinky/Zprávy/Profil. Domů a Oblíbené zůstávají dohledatelné.
  Novinky/Zprávy se po vypršení přihlášení otevřou v původní sekci; neznámé,
  opakované nebo útočné `view` přejde do bezpečného přehledu účtu.
- 360 px, tablet, desktop, safe area instalované PWA, keyboard/fokus a
  reduced motion. Soukromé sekce neposílají analytiku; runtime/SRI a
  dosavadní DNT/GPC/offline/session guards zůstávají ověřené.
  Přepnutí tlačítkem přesune fokus na nový h1 po renderu; nadpis je přitom
  mimo běžné pořadí Tab a není animovaný scroll při reduced motion.
- Přejmenování má jeden zachovaný typ/slug, beze změny času/ceny/kapacity,
  rezervací a historických snapshotů výkazů. Viditelný název i nový výchozí
  plakát jsou „Formuj břicho a hýždě“; starý odkaz dál otevře stejnou lekci.
  Individuálně nahraný obraz se migrací nepřepíše a dodaný originál zůstane zachovaný.

## CD-069–070: diagnostika relace a autorský podpis

- Skutečný PostgreSQL: důvod a request ID se ukládají atomicky s revokací;
  opakování a souběh zachovají první důvod a nevydají druhou událost.
  Expiry, idle, chybějící/poškozená credential, invalid grant, neplatné
  identity claims, změna subjektu a odebrání role mají vymezené důvody.
- Provider timeout/503/JWKS nedostupnost zachovají relaci a rotovanou
  credential bez zvýšení MFA. Žádný diagnostický log nesmí obsahovat
  fixture token, cookie, jejich hash, e-mail, IP nebo provider free text.
  Rollback transakce nesmí vydat událost dokončené revokace.
- Explicitní admin vstup loguje jen přítomnost cookies; callback rozlišuje
  persistentní/session-only cookie a logout zachovává request ID.
  Diagnostika nepatří do veřejných REST odpovědí ani produktové analytiky.
- Patička: přesné tři HTTPS cíle, oficiální lokální ikony, 360 px i desktop,
  keyboard/fokus a dotykové cíle. Tři kliknutí mají odlišné centrální
  události, původní outbound-click funguje. Libovolné názvy se odmítnou.
- Zachovat osm veřejných cest, obě approval gates, byte-exact společný
  runtime/SRI, DNT/GPC, offline discard a obě session-cookie exclusions.
  Runtime test běží proti izolovanému přijímači bez skutečného analytického
  zápisu. Centrální příjem a souhrn se potvrzují samostatně ve VCode.

## CD-071: zrušení jednoho konkrétního termínu

- Karta Zrušit jeden termín je snadno dohledatelná v Rozvrhu. Výběr data
  najde lekci i za hranicí 14denního seznamu Rezervací, pokud již existuje
  v průběžném tříměsíčním horizontu. Místní datum a čas se správně zobrazují
  v `Europe/Prague`, včetně dne změny letního času.
- Výběr data filtruje již načtené termíny administrace bez samostatného GET
  pro vybraný den. Počáteční loading/error řeší rodičovská administrace.
  Výběr se omezuje na jeden budoucí naplánovaný termín. Prázdný den a změna
  data nezanechají vybraný termín z jiného dne. Zrušený, minulý či nenalezený
  termín se nesmí odeslat.
- Karta i Zrušit v týdenním řádku otevřou stejný vložený formulář se jménem,
  přesným datem/časem, instruktorem, aktuálním počtem rezervací a dopadem.
  Browser prompt se nepoužívá. Pole Důvod zrušení pro klienty po oříznutí
  mezer vyžaduje 3–1000 znaků; bez potvrzovacího checkboxu se neodesílá.
  Potvrdit zrušení tohoto termínu odesílá, Ponechat termín nic nemění,
  neplatný důvod se neodesílá a chyba důvod zachová.
- Před potvrzením se znovu načtou aktuální údaje. Změna jména, času,
  instruktora, stavu nebo počtu rezervací vyžádá novou kontrolu; první
  potvrzení nepošle zrušení změněného shrnutí. Dvojklik nesmí vytvořit druhý
  požadavek. Chybová odpověď a 401 nesmějí ukázat úspěch.
- Úspěch označuje konkrétní termín a aktualizuje seznamy; přímo v kartě lze
  následně vybrat další termín bez reloadu. Nápověda rozlišuje
  jednotlivé zrušení, pozastavení nových rezervací a celou pravidelnou řadu.
  Sdělení slibuje zprávu v klientském účtu, nikoli e-mail.
- Zachovat stávající API autorizační/validační a transakční testy zrušení:
  rezervace mají `cancelled_by_studio` bez nového poplatku, zprávu v účtu
  a audit; další termíny/pravidla se nemění. Generátor zrušený termín
  nepřidá znovu. Souběh mezi kontrolním načtením a POST se řídí existující
  transakcí; neprohlašovat náhled za nový atomický serverový kontrakt.
- Responzivita 360 px a desktop, dotykové cíle, ovládání pouze klávesnicí,
  fokus po otevření a návratu, popisky polí, stavová oznámení a čitelnost
  chyby. Ověření v produkci provést bez zrušení skutečné lekce; mutační
  scénáře pouze na izolovaných testovacích datech.

## CD-072: klientský návrh recenze a moderace

- veřejný návrh bez přihlášení, s ratingem i bez něj, délky jména 1–80 a textu
  10–2000; neznámá pole, HTML jako prostý text, neplatný rating a chybějící
  nebo starý souhlas vracejí ErrorResponse;
- výzva: správný podpis/účel, expirace 30 minut, minimální stáří 2 sekundy,
  tamper, chybný origin, ne-JSON a honeypot; žádné credentials/PII v odpovědi;
- idempotentní stejný nonce a stejný obsah, změněný obsah se stejným nonce
  409 a souběžný retry právě jeden DB návrh;
- transakční 30/network a 200/global za klouzavých 60 minut, /24 a /56
  normalizace, přechod oken, 2hodinová expirace technických záznamů a periodický
  10minutový worker úklid nejvýše 500 pouze expirovaných řádků; žádná surová IP
  v uložených řádcích a žádné předstírané přijetí při DB chybě;
- administrační GET/decision bez relace 401 a klientská relace/role bez MFA
  403; pending oldest-first, max 100 a přesný pendingCount;
- schválení založí právě jednu recenzi s původním jménem/textem/ratingem,
  zdrojem Web studia a auditem; paralelní schválení ani retry nevytvoří kopii;
- odmítnutí vyžaduje důvod, opakování je idempotentní, opačné rozhodnutí je
  409; návrh čekající/odmítnutý se nikdy nevrací veřejným GET;
- starý admin editor nesmí změnit původní klientský text/jméno/rating,
  může skrýt, zvýraznit nebo změnit pořadí; stažení souhlasu skrytím odstraní
  veřejnou vazbu a nenutí mazat audit;
- UI od 360 px, klávesnice, čtečka/popisky, bez ratingu, neplatný souhlas,
  výzva nedostupná/expirující, limit četnosti, zachování textu po chybě,
  submit pending/success, admin loading/empty/error/conflict/expired session;
- homepage a Recenze nabízejí formulář i při prázdném pásu; QR i čitelný odkaz
  otevírají přesně `/recenze/napsat`, tisk bez navigačního balastu;
- analytics: nové `/recenze/napsat` a `/recenze/qr`, jejich query varianty,
  pole formuláře a odeslání neposílají žádnou veřejnou událost; dosavadní
  explicitní odchozí kliknutí, cookie suppression, DNT/GPC a SRI se nemění.

Před vydáním spustit validační JSON/OpenAPI a generování kontraktů, relevantní
API/controller/DB a web component/security testy. DB souběh ověřit izolovanou
lokální databází, ne produkčními klienty. Produkční evidence musí oddělit
nasazení, anonymní dostupnost a skutečně vykonanou autorizovanou moderaci;
nezveřejňovat testovací reference a netvrdit QR test na fyzickém telefonu,
pokud nebyl proveden.

- Klientská schválená recenze přijme PATCH pouze zobrazení (`published`,
  `featured`, `sortOrder`); ruční recenze odmítne tento zkrácený vstup.
  Původní klientské jméno, text a hodnocení zůstanou při skrytí beze změny.
- Validační délky nového formuláře počítají znaky Unicode konzistentně
  s databází; krátký text z několika emoji vrátí 400, nikoli systémovou chybu.

## Retence produkčních vydání

Samostatná provozní kontrola `python3 scripts/test-production-storage.py`
ověřuje také minimálně tři odlišné návratové generace, přítomnost zdrojů a
migrací, shodu a zdraví všech produkčních kontejnerů, ochranu obrazů zastavených
i cizích kontejnerů, rozpracovaný deployment a odmítnutí změněného image tagu.
Testy používají dočasné soubory a falešný Docker inventář; nemění produkci.

## Obnova hesla a ochrana přihlášení (ADR 0031)

- `python3 scripts/test-keycloak-recovery.py`: scope realmu, povolené změny,
  SMTP/TLS, chybějící ověření doručení, soukromé soubory a snapshot, absence
  secretů v diagnostice, force-login, odmítnutí změněného flow a rollback.
- Skutečný izolovaný Keycloak 26.8.0 a testovací SMTP: stejná obecná odpověď
  pro existující/neexistující účet, doručený odkaz, nové heslo funguje/staré
  selže, použitý/prošlý odkaz selže, admin TOTP zůstane a heslo samotné nestačí.
- Syntetický účet: pět neúspěšných pokusů vyvolá dočasnou ochranu, čekání a
  obnova fungují; testy nikdy nezkoušejí hesla skutečných klientů.
- `python3 infra/nginx/test-recovery-privacy.py` a izolovaný skutečný Nginx
  `test-recovery-privacy-runtime.py`: query/Referer/cookie/auth nejsou v logu
  ani při upstream chybě, změny jiných serverů se neprovedou, druhý běh je
  idempotentní. Produkční `smoke-recovery-privacy.py` používá neškodný řetězec.
- Téma a vstupní stránka: CS/EN, mobil360px/desktop, keyboard, nepřekrývající
  se nápověda a funkční podmíněný odkaz. Žádná veřejná analytika v auth toku.
- Nasazení zaznamená zvlášť revizi webu, jméno/verzi identity tématu, stav
  SMTP/policy a výsledek doručení. Nedokončený reset klienta se nepovažuje
  za ověřené obnovení přístupu. Produkční tokeny se neukládají do důkazů.

Skutečný identity test běží příkazem `python3 scripts/test-keycloak-recovery-runtime.py`
proti výhradně dočasnému Keycloak 26.8.0 na `127.0.0.1:18188` a testovací
schránce Mailpit na `127.0.0.1:18255`. Vyžaduje pouze syntetické
`KEYCLOAK_RECOVERY_TEST_ADMIN_PASSWORD` a `KEYCLOAK_RECOVERY_TEST_SMTP_HOST`
(privátní adresa testovacího SMTP v oddělené Docker síti). Realm
`studio-balance` musí na této instanci před spuštěním chybět; test jej po
ověření odstraní. Nesmí se použít produkční server ani jeho credentials.


## Administrative cancellation release gate (CD-074)

Isolated PostgreSQL scenarios cover self/companion/both scope, another owner,
exact DST spring/fall 24h instants, free-change window, late snapshots/waivers,
old financial records, stale price/cutoff previews, simultaneous admins/retries,
changed replay payload, started/cancelled lessons, MFA/role defense, notice/outbox
atomicity, capacity release and concurrent new booking. HTTP tests cover auth,
strict body validation and receipt status; UI checks cover future-only action,
preview/fee/scope confirmation, keyboard and 360px layout, errors and safe retry.
Production smoke must not cancel an unapproved customer's real reservation.

Validation for CD-074: full local run passed 525 application tests (API 258,
web 255, domain 7, worker 5), typecheck, lint, build, repository/contract/analytics
gates. Added final transaction-rollback and old-retry/replacement-reservation
regressions are checked separately. UI harness uses the actual component with
synthetic API responses; verified one/both seats, waiver reason, explicit unchecked
confirmation, keyboard apply and success at 360px without horizontal overflow.
An initial 512MiB test PostgreSQL tmpfs filled during repeated migration suites;
verification was rerun successfully in a clean task-owned 2GiB tmpfs database.
No production data was used.

## Regrese závislostí 2026-10-27

Po bezpečnostní aktualizaci Next/Fastify/Zod/fast-uri/Vitest/Vite prošlo
`pnpm check` a všech 527 aplikačních testů s izolovaným lokálním PostgreSQL.
Při změně data testovací lekce musí přípravky současně přesunout
booking_opens_at a booking_closes_at; jinak po uplynutí pevného DST data
poruší databázové constraints dříve, než ověří zamýšlenou časovou hranici.
Produkční constraint ani storno pravidlo se kvůli testům neuvolňuje.

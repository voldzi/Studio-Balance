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

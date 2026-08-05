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
- Keycloak issuer/audience/signature/expiry validace, neověřený e-mail a
  odhlášení mají pozitivní i negativní testy;
- admin bez MFA nesmí vstoupit do administrace; změna role nebo MFA reset se
  projeví v relaci a auditu;
- web, API a worker zůstávají kompatibilní během rollout/rollback okna.

## UI a přístupnost

Každá kritická obrazovka pokryje loading, empty, disabled, success, validation,
system error, permission denied a případný offline/stale stav. Povinný smoke:

- 360 px, tablet a desktop;
- současné Safari iOS/macOS, Chrome Android/desktop, Edge, Firefox;
- keyboard-only, viditelný fokus a dialog focus restore;
- automated WCAG audit + ruční formuláře/live region/zoom/reduced motion;
- Keycloak login theme na přihlášení, registraci, obnově hesla, validační chybě
  a nastavení MFA při 360 px i desktopu; žádný horizontální scroll, useknutý
  formulář ani únik QR secretu do důkazu;
- žádný capacity count, waitlist, payment CTA nebo permanentka v DOM,
  accessible name, URL payloadu ani analytics eventu;
- schválené logo/fotografie, crop a layout bez překryvu/shiftu.

## Oznámení

- confirmation/reminder/change/cancel se váže na správný booking a místní čas;
- 24h/2h/30m plán na obou DST obdobích;
- změna termínu zruší staré joby a vytvoří nové;
- cancellation zruší budoucí reminders;
- retry je idempotentní a neprodukuje nekontrolované duplicity;
- permanent e-mail failure důležité změny vyvolá alert/ruční fallback;
- odkaz z e-mailu otevře správný objekt po loginu i bez aktivní session;
- marketing preference neblokuje provozní komunikaci a naopak.

## Admin, CMS a média

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

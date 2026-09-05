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

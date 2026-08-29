# ADR 0001: Výchozí aplikační architektura

- Status: Superseded by ADR 0003
- Datum: 2026-08-04
- Vlastníci rozhodnutí: product owner Studio Balance + technický vlastník (TBD)

## Kontext

Produkt má čtyři povrchy – veřejný web, klientský účet/rezervace, mobilní
aplikaci iOS/Android a administraci – nad jedním API a jednou databází. Veřejný
web potřebuje SEO/SSR, mobil push/deep links, booking potřebuje transakční
správnost a obsah se má měnit bez mobilního release. Produkční topologie je
přijata v ADR 0002; tým, rozpočet, aplikační stack a ostatní providers nejsou
zatím potvrzeni.

## Navrhované rozhodnutí

Použít TypeScript monorepo a modulární monolit:

```text
apps/
  web/       Next.js: veřejný web, klientský účet a oddělená admin oblast
  api/       NestJS s Fastify adapterem: REST/doména/autorizace
  worker/    asynchronní outbox, e-mail, push a plánované úlohy
  mobile/    Expo + React Native pro iOS a Android
packages/
  contracts/ typy generované z OpenAPI
  domain/    sdílené čisté typy/pravidla bez DB nebo UI závislosti
  ui-tokens/ brand tokeny sdílené mezi webem a mobilem
```

Správa workspace: `pnpm`; orchestrace buildů/cache: Turborepo nebo minimální
pnpm workspace podle reálné potřeby. Primární data a produkční perzistence:
PostgreSQL podle ADR 0002. Obsahová média mohou používat S3-kompatibilní
úložiště podle ADR 0002; metadata a doménové vazby zůstávají v PostgreSQL.
Notifikace: transakční e-mail + APNs/FCM přes zvolenou serverovou integraci.
API je JSON-first OpenAPI `/api/v1`.

Web a admin mohou být v jednom deployi, ale mají oddělené routes, layout,
autorizaci a security boundary. API/worker začínají jako jeden kódový základ s
logickými moduly; mikroslužby nejsou cílem první verze.

Konkrétní ORM, S3 klient a model media cache, auth/session knihovna, queue
implementace, Docker/Nginx deployment a providers nejsou tímto ADR vybrány.
Dostanou vlastní decision record nebo doplnění před scaffoldem.

## Důvody

- jeden jazyk snižuje rozdíly mezi API, webem, workerem a mobilními typy;
- Next.js podporuje indexovatelný veřejný obsah a zároveň transakční UI;
- React Native/Expo splňuje očekávání obchodů a push bez dvou oddělených UI týmů;
- samostatná API doména drží booking pravidla mimo klienty;
- PostgreSQL poskytuje transakce, constraints a locking pro kapacitu;
- existující S3-kompatibilní službu lze využít bez zavedení externího cloudu,
  ale jen s vlastní tenant izolací a provozní odpovědností;
- modulární monolit je provozně jednodušší než mikroslužby a stále umožňuje
  pozdější oddělení workeru či komponenty;
- OpenAPI umožní generovat konzistentní web/mobile klienty.

## Zvažované varianty

### A. Jeden Next.js backend + Expo bez samostatného API frameworku

Nejméně komponent, ale hůře odděluje bohatou doménu, admin autorizaci,
background joby a dlouhodobý mobilní kontrakt. Vhodné jen po důkazu, že
architektonické hranice zůstanou stejně přísné.

### B. Samostatné nativní iOS a Android aplikace

Nejlepší platformní kontrola, ale vyšší náklady, dvě implementace obrazovek a
větší riziko rozdílného chování. Zadání preferuje kvalitní cross-platform
řešení, pokud splní zkušenost.

### C. PWA místo mobilních aplikací

Nejnižší delivery náklady, ale výslovně vyžaduje předchozí schválení
provozovatelky a je slabší proti výchozímu očekávání App Store/Google Play.

### D. Mikroslužby od první verze

Oddělují škálování, ale přidávají distribuované transakce, více deployů a
observability zátěž bez doložené potřeby. Zamítnuto pro výchozí návrh.

## Důsledky při přijetí

Pozitivní:

- sdílené kontrakty a design tokeny;
- jedna implementace booking invariantu;
- přirozený SSR/SEO web a skutečná mobilní aplikace;
- jasná cesta k workeru a idempotentním notifikacím.

Náklady/rizika:

- monorepo CI a release matice více aplikací;
- nutnost držet generované API klienty kompatibilní;
- Expo/native modul je třeba ověřit proti push, deep links, store a budoucím
  požadavkům;
- NestJS i Next.js mohou být pro malý tým těžší; scaffold má být štíhlý a bez
  spekulativních balíčků.

## Podmínky přijetí

- potvrzený vývojový/provozní tým a kompetence;
- potvrzené hostingové a service rozpočty;
- potvrzená PostgreSQL major/TLS a Docker/Nginx deployment cesta podle ADR 0002;
- spike transakční rezervace na zvoleném ORM/DB isolation;
- spike Expo push/deep links a podporované OS;
- schválený auth/session model a admin MFA;
- přesné lokální příkazy, CI a deployment/rollback návrh.

Do přijetí se nevytváří frameworkový scaffold, který by toto rozhodnutí udělal
fakticky nevratným.

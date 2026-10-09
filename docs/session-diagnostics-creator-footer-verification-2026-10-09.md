# Ověření diagnostiky relací a autorské patičky — 2026-10-09

Rozsah: CD-069, CD-070 / ADR 0027, ADR 0028. Změna přidává bezpečné provozní
důvody zneplatnění relací a veřejný podpis VCode s odkazy Moje porce a Městem
hrou. MFA, délka relací, oprávnění a pravidla rezervací se nemění.

## Lokální ověření kandidáta

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm validate:repo` prošly. Plný unit gate: web 200, API 135,
  domain 7, worker 3; databázové testy v tomto gate nejsou spuštěné.
- Samostatná izolovaná PostgreSQL 18.6: 76 integračních testů v 10 souborech
  prošlo, včetně 6 testů nové migrace, souběhu a zachování prvního důvodu.
  Použita pouze syntetická lokální data, žádné produkční údaje.
- Po doplnění samostatné patičky hlavní stránky znovu prošlo sestavení webu,
  všechny 3 testy patičky a kontrola dokumentačního skeletu.
- Skutečný prohlížeč: šířka 360 px bez vodorovného přetečení, všechny tři
  lokální oficiální ikony načtené, odkazy mají alespoň 44 px na výšku,
  tabulátor přechází mezi odkazy. Desktop 1004 px: text a kontext patičky
  vizuálně ověřeny. Lokální analytics se na nepovoleném originu nespustily.
- Izolované runtime testy ověřily tři přesné události, jediný payload na
  kliknutí bez obecného duplikátu, DNT/GPC, offline discard, obě aplikační
  cookies, původních osm cest, přesné SRI a zachování TikTok kompatibility.
- Nezávislá kontrola transakcí, logování a analytické hranice bez blokujících
  nálezů. `git diff --check` prošel.

Chroma MCP neumí reindexovat tento připojený worktree; jeho scoped CLI také
odmítá root mimo projekty vybrané v aplikaci. Canonical retrieval fungoval,
změny byly čteny a ověřeny přímo v tomto worktree. Sdílená Chroma se neměnila.

## Koordinace s VCode

Centrální podpora je nasazena z revize `74e5555`, analytics image
`sha256:f5617560dd04646f18877fc71a2b93af7babfaf09bc3a8e950716ed32729e819`.
Po ověření živé patičky, pátého CS/EN odstavce a runtime VCode otevřelo
per-site gate v `2026-10-09T13:03:50.827715Z`. Aktivace potvrzuje tři přesné
portfolio názvy, zachování osmi cest a outbound, nezměněné ostatní weby,
shodný trackerPath/SRI a žádné acceptance události na skutečné website ID.
Dashboard načetl schválený rozsah. VCode následně potvrdilo úspěšnou kontrolu
z provozního prostředí monitoru se standardními monitorovacími hlavičkami:
přesný nový runtime a očekávané 400 pro prázdný collector payload. Úvodní
ruční kontrola se od monitoru lišila; nesoulad nepřetrvává při správném
monitorovacím požadavku. Běžící collector všechny tři názvy přijal a odmítl
nepovolené cíle, soukromé cesty a raw údaje v izolovaném paměťovém testu,
bez odeslání do Umami. Anonymní API Přehledu zůstalo 401.

## Produkční stav

Guarded nasazení aplikace `27b6e11` (Git
`27b6e11e7833f836ba7fc6edb56f48db89c49c77`) skončilo exit 0. Centrální
portfolio aktivace a závěrečná kontrola monitorovacího požadavku potvrzeny.
Baseline pro návrat aplikace:
`09415a2dd1168c2df67b1cde73b6308715128ec3`. Migrace 0031 je aditivní; při
návratu starší aplikace se nové sloupce ponechají. Nevynucovat nové přihlášení,
neodvolávat funkční relace a neobnovovat databázi jen kvůli rollbacku kódu.

Před nasazením ověřen X5 UUID `2f93f595-b61b-4eea-9054-7afa9b275b5b` a
konzistentní custom `pg_dump` přes `haproxy.home.cz:5000`, uložený v
`/srv/x5-production/backups/studio-balance/database-before-sessiondiag-20261009.M6VwuBbg/`.
Dump má 508 038 bajtů; checksumy dumpu i TOC prošly, `pg_restore --list`
vrátil 163 řádků. Toto ověřuje čitelnost archivu, nikoli úplný test obnovy
produkčních dat. Záloha neopustila server. Podle vlastníka je celý server
včetně X5 pravidelně zálohován přes Proxmox na jiný server; tento release
samostatně neověřoval obnovu z té vzdálené kopie.

Web, API a worker jsou zdravé se shodnou release verzí; ověřen úspěšný startup
workeru a identita všech tří procesů:

| Proces | Image ID |
| --- | --- |
| web | `sha256:de406bfd0cf9af2b118d15a97f60edae15ea79fa50a0bc2dff38d804f8648d07` |
| API | `sha256:a59f2d4a5e3e1fe31a1f918a3789d061910c4ced4b185f64ce5173535fccb343` |
| worker | `sha256:e69899db41de55ff9cdd39f6e82e00bc07c744ac9a7a5d9bf15ce5a5923ed22d` |

Trivy každý obraz: HIGH 0, CRITICAL 0, pokrytí OS i knihoven. Soukromá evidence
`/srv/x5-production/archives/studio-balance/image-scans/27b6e11/20261009T125034Z-aLOaLiH8/verified.json`.
Migrace 0031 aplikována; přímo načtená DB metadata potvrdila checksum
`dd22dce7099a7f3f8014134b5d085d85e5db0b3f999545657565d57771300628`, tři sloupce
a všechny čtyři nové CHECK constraints. Nečetly se uživatelské ani tajné údaje.

Veřejné anonymní HTTPS GET v 12:55:47 UTC potvrdily hlavní stránku i
`/o-studiu`: každý ze tří odkazů právě jednou, všech pět přesných CS i EN
odstavců, `private, no-store`. Runtime vrací 200 JavaScript a přesné společné
bajty/SRI; všechny oficiální ikony jsou byte-exact. Devět živých Next chunks
obsahuje nový runtime path, revision, SRI a tři povolené názvy událostí.
GET s přítomností každé aplikační cookie potlačil veřejnou analytickou notice.
`/admin/prihlaseni` má no-store; privátní cesta není povolená pro měření.
Python HTTPS klient byl lokálně odmítnut při TLS spojení; běžně ověřující
systémový curl stejné požadavky dokončil. TLS ochrana se neměnila.

Skutečná přihlášená IAB relace `/admin` přežila reload nasazené verze bez
nového přihlášení nebo OTP. Na této stránce i na veřejné patičce otevřené
v existující soukromé relaci se načetlo nula analytických skriptů. Patička
vizuálně ověřena, ikony načtené, viditelný focus při Tab. Soukromé cookies,
rezervace a formuláře se neměnily. Žádný acceptance collector POST ani
produkční testovací kliknutí nebylo odesláno; důkaz není reálný uživatelský
klik ani fyzická akceptace PWA.

Produkční screenshot:
`/private/tmp/studio-balance-creator-footer-production-20261009.jpg`;
detail celé patičky s kontakty a viditelným focusem:
`/private/tmp/studio-balance-creator-footer-production-detail-20261009.jpg`;
HTTP receipt `/private/tmp/studio-footer-production-receipt-20261009.json`.
Vlastní lokální webový proces a tmpfs testovací PostgreSQL byly ukončeny;
jiné kontejnery, volumes a sdílené služby se neuklízely.

Nové důvody popisují pouze zneplatnění po instalaci změny. Starší záznamy mají
důvod neznámý; chybějící cookie sama nerozlišuje smazání od izolace prohlížeče.

Centrální nezávislý receipt spravuje VCode v revizi `0f78ef6`, soubor
`docs/studio-balance-footer-analytics.md`, oddíl Aktivace Studio Balance.
P1 aktivace je samostatná, nečeká na portfolio-2 dalších aplikací.
Dokumentační commit po `27b6e11` nemění nasazený kód ani image identity.

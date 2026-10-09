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
Tři nové události zatím mají zavřený centrální gate. Aktivace pro Studio
Balance následuje až po ověření živé patičky, pátého CS/EN odstavce a runtime.

## Produkční stav

Nasazení tohoto kandidáta a centrální aktivace zatím čekají na závěrečný
receipt. Baseline pro návrat aplikace:
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

Nové důvody popisují pouze zneplatnění po instalaci změny. Starší záznamy mají
důvod neznámý; chybějící cookie sama nerozlišuje smazání od izolace prohlížeče.

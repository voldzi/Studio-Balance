# Ověření bezpečnostních a výkonnostních oprav 2026-10-07

Stav: implementováno a ověřeno v izolované kopii; do produkce nenasazeno.
Výchozí zdrojová revize: `97973d3`; větev `codex/security-performance-oct7`.
Původní pracovní kopie s nesouvisejícími změnami zůstala zachovaná.
Rozhodnutí a praktické limity popisuje [ADR 0025](adr/0025-security-and-performance-hardening.md).

## Co se změnilo

- Opravené verze knihoven a ověřovaný lokální patch vývojového braces.
- HMAC interních požadavků chrání také tělo a jednorázovou hodnotu;
  interní cesty jsou blokované na webu i v připravené konfiguraci Nginx.
- Bezpečné návratové adresy přihlášení, omezené čekání na poskytovatele
  identity, zachování přihlášení při přechodném výpadku a méně zámků
  a zápisů při ověřování platné relace. Povinné MFA zůstává.
- CSP s novou nonce pro každou odpověď, zákaz vložení do cizích stránek
  a ukládání soukromých odpovědí do cache. Schválená analytika, její
  přesné soubory a pravidla soukromí zůstaly zachované.
- Omezení vstupních fotek na JPEG/PNG/WebP před jejich dekódováním,
  odstranění metadat a opětovná kontrola publikace médií při každém čtení.
- Souběžné rezervace a změny docházky počítají i obsazená místa již
  označená jako přítomná či nedostavená. Změny a audit se ukládají atomicky.
- Stránkování rezervací, nejbližší budoucí termíny a časové filtry;
  veřejná kapacita zůstává skrytá. Komprese je připravena pouze pro veřejný rozvrh.
- Povinné databázové testy v CI, ověření všech tří verzí kontejnerů,
  první úspěšné práce workeru a restartů během kontroly. Automatický
  návrat používá Compose předchozího neměnného releasu.
- Kontroly úplnosti provozních nástrojů a checksumů uchovávaných záloh.
  Zachované X5 mount guardy, zámky operací a schválená retence.

## Dokončené ověření

| Kontrola | Výsledek |
|---|---|
| Neměnná instalace pnpm 11.26.0 | prošla |
| Lint a typová kontrola všech workspace projektů | prošly |
| API jednotkové testy | 103/103 |
| Povinná databázová sada na izolovaném PostgreSQL 18 | 55/55, 7 souborů, nic vynecháno |
| Webové testy | 155/155 |
| Doménové testy | 7/7 |
| Worker testy | 3/3 |
| Správa úložiště | 5/5 |
| Nasazení, ověřování a automatický rollback | 8/8 |
| Skutečně aplikovaný braces patch | 122 kontrol |
| Testy bezpečnostní auditní brány | 3/3 |
| Produkční sestavení webu, API a workeru | prošlo |
| OpenAPI, generované kontrakty, analytika, kostra a Keycloak téma | prošly |
| Generovaná konfigurace Nginx 1.30.4 | syntaktická kontrola prošla |

Nezávislá kontrola změn odhalila regresi automatického návratu na starší
worker. Byla opravena a doplněny dvě regresní kontroly. Starší obraz
se nyní spouští s jeho vlastním nastavením; chybějící zdroj se odmítne
ještě před změnou kontejnerů.

Nezkrácený audit registru: 0 kritických, 1 vysoký ve vývojovém braces,
0 ostatních. Auditní brána prošla až po ověření přesných aplikovaných
souborů a regresí. Neexistuje trvalý ignore. Viz [audit knihoven](dependency-audit.md).

## Prohlížeč a skutečné HTTP odpovědi

Izolovaný web s migrovanou testovací databází se zkontroloval v prohlížeči
na desktopu a šířce 360 px. Rozvrh a detail termínu se načetly, navigace
fungovala, mobilní menu otevřelo samostatný návod k přidání aplikace a po
zavření vrátilo fokus. Přihlašovací stránka administrace neměla vodorovný
přesah. Konzole nehlásila chyby či upozornění.

HTTP kontrola potvrdila souhlas nonce v CSP a všech serverem vydaných
skriptech domovské stránky, rozvrhu a přihlášení. Dvě nové odpovědi mají
různé nonce. HTML používá `private, no-store`; veřejný přístup k interní
cestě vrací 404; nepřihlášené soukromé API vrací 401 a `private, no-store`.
HTTP regresní test publikovaných médií ověřuje 200 a po odebrání vazby 404
bez dalšího čtení objektu z úložiště.

Krátké měření: deset následných místních HTTP požadavků na každou cestu,
všechny 200. Medián / maximum v ms: `/` 4,77 / 20,07;
`/rozvrh` 3,42 / 4,15; `/admin/prihlaseni` 3,23 / 4,50;
`/api/v1/sessions` 3,87 / 8,71. Jde pouze o místní odezvu na malé
testovací databázi, nikoli měření produkční zátěže či rychlosti v telefonu.

## Limity a dokončení vydání

Nebyla změněna produkční konfigurace, databáze, fotografie, rozvrh,
registrace ani účty. Produkční obrazy nebyly v této implementační kontrole
sestaveny nebo skenovány; jejich existující CI brány zůstávají povinné.
Nebylo provedeno skutečné přihlášení heslem a MFA ani 90denní či fyzické
telefonní ověření. Syntaktická kontrola Nginx nedokazuje aktivovanou kompresi
na DMZ. Ověření zachování souborů záloh není nový produkční restore drill.

Při vydání sestavit a skenovat všechny obrazy, nasadit web/API/worker
společně přes standardní guarded postup, samostatně aktivovat a ověřit
změnu Nginx, zkontrolovat přesnou revizi, zdraví a přihlášení v produkci.
Nemíchat HMAC protokol starého API s novým webem. Při neúspěchu použít
ověřenou předchozí revizi a její Compose; produkční data zůstávají zachovaná.

Reindexace byla zkusena přes Chroma MCP a následně scoped CLI. MCP
nevrátilo seznam spravovaných kořenů; CLI skončilo na odmítnutém spojení
embedding služby Ollama. Sdílená služba nebyla restartována ani změněna.
Po obnovení retrieval je nutné indexovat tuto implementační větev.

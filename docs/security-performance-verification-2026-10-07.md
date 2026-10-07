# Ověření bezpečnostních a výkonnostních oprav 2026-10-07

Stav: nasazeno; závěrečný veřejný HTTP gate prošel 2026-10-07 v 16:56:59 UTC.
Produkční aplikace: `1923ef305c679d0da28c3973e86ea3e5f886bf96`.
Web, API a worker se nasadily společně; následná kontrola přesných obrazů,
verze, readiness a práce workeru prošla. Všechny tři kontejnery jsou zdravé
bez restartu či OOM. Infrastrukturní opravy `162e70c` a `bc18d54` mají
pozdější revizi; nejde o revizi běžících aplikačních obrazů.

Výchozí zdrojová revize: `97973d3`; větev `codex/security-performance-oct7`
v izolované pracovní kopii `/private/tmp/studiobalance-audit-20261007`.
Původní pracovní kopie s nesouvisejícími změnami zůstala zachovaná.
Rozhodnutí a limity popisuje [ADR 0025](adr/0025-security-and-performance-hardening.md).

## Co se změnilo

- Opravené verze knihoven a ověřovaný lokální patch vývojového braces.
- HMAC interních požadavků chrání také tělo a jednorázovou hodnotu;
  interní cesty jsou blokované na webu i na vstupním Nginx.
- Bezpečné návratové adresy přihlášení, omezené čekání na poskytovatele
  identity, zachování relace při přechodném výpadku a méně zámků
  a zápisů při ověřování platné relace. Povinné MFA zůstává.
- CSP s novou nonce pro každou odpověď, zákaz vložení do cizích stránek
  a ukládání soukromých odpovědí do cache. `form-action` povoluje pouze
  vlastní origin a schválený `https://login.studio-balance.cz`.
  Schválená analytika, přesné soubory a pravidla soukromí zůstaly zachované.
- Omezení vstupních fotek na JPEG/PNG/WebP před dekódováním,
  odstranění metadat a opětovná kontrola publikace médií při každém čtení.
- Souběžné rezervace a změny docházky počítají i obsazená místa již
  označená jako přítomná či nedostavená. Změny a audit se ukládají atomicky.
- Stránkování rezervací, nejbližší budoucí termíny a časové filtry;
  veřejná kapacita zůstává skrytá. Komprese je omezena na veřejný rozvrh.
- Povinné databázové a skutečné Nginx testy v CI, skeny všech tří obrazů,
  ověření verzí kontejnerů, první úspěšné práce workeru a restartů.
  Automatický návrat používá Compose předchozího neměnného releasu.
- Kontroly úplnosti provozních nástrojů a checksumů uchovávaných záloh.
  Zachované X5 mount guardy, zámky operací a schválená retence.

## Lokální ověření

| Kontrola | Výsledek |
|---|---|
| Neměnná instalace pnpm 11.26.0 | prošla |
| Lint a typová kontrola všech workspace projektů | prošly |
| API jednotkové testy | 103/103 |
| Databázová sada na izolovaném PostgreSQL 18 | 55/55, 7 souborů, nic vynecháno |
| Webové testy | 159/159 |
| Doménové testy | 7/7 |
| Worker testy | 3/3 |
| Správa úložiště | 6/6 |
| Nasazení, ověřování a automatický rollback | 8/8 |
| Produkční skenovací brána | 8/8 |
| Nginx hardening jednotkové testy | 19/19 |
| Skutečný izolovaný Nginx na Linuxu | 3/3 |
| Skutečně aplikovaný braces patch | 122 kontrol |
| Testy bezpečnostní auditní brány | 3/3 |
| Produkční sestavení webu, API a workeru | prošlo |
| OpenAPI, generované kontrakty, analytika, kostra a Keycloak téma | prošly |

Nezávislá kontrola změn odhalila regresi automatického návratu na starší
worker. Byla opravena a doplněny dvě regresní kontroly. Starší obraz
se spouští s vlastním nastavením; chybějící zdroj se odmítne před změnou kontejnerů.

Nezkrácený audit registru: 0 kritických, 1 vysoký ve vývojovém braces,
0 ostatních. Auditní brána prošla po ověření přesných aplikovaných
souborů a regresí. Neexistuje trvalý ignore. Viz [audit knihoven](dependency-audit.md).

## Produkční obrazy a vydání

| Služba | Ověřený Docker image ID |
|---|---|
| web | `sha256:cec0d808445ef2a33d7686da068534dcbe3cec3b4df48da6e14a4bfc86e9ea79` |
| API | `sha256:7cc23f728254297b24db2464caad4ca7276067f8d04f4d937421b775e57d6cba` |
| worker | `sha256:b49bb5bf6a09eb3dafed7d06231b38a9a2df311a5ff621e55cfaaf45b06fc2e1` |

Sdílený server před sestavením odmítl vydání kvůli dostupné paměti pod
2 GiB. Obrazy `linux/amd64` se proto sestavily lokálně z přesného čistého
commitu, postupně v samostatném omezeném builderu. Přenos na X5 prošel
SHA-256 a ověřením identity všech obrazů. Standardní režim pro předem
sestavené obrazy zachoval migrace, skeny, mount guardy, zámky a readiness.
AKB reranker nebyl zastaven. Vlastní lokální builder, jeho cache a přenosový
archiv byly po ověření odstraněny; ostatní aplikace a sdílené buildery se neměnily.

Povinný Trivy 0.75.0 sken před spuštěním prošel pro všechny tři obrazy:
**0 HIGH / CRITICAL**, základ Alpine 3.24.1 a aplikační závislosti.
Jde o tyto úrovně závažnosti, nikoli tvrzení o nulovém počtu všech nálezů.
Databáze advisory byla aktualizována 2026-10-07; skener používá připnutý
digest a samostatnou X5 cache bez přístupu k Docker socketu či prostředí aplikace.

Povinný scan receipt:
`/srv/x5-production/archives/studio-balance/image-scans/1923ef305c679d0da28c3973e86ea3e5f886bf96/20261007T162108Z-m5iPAIFn`.
Nezávisle kontrolovaný předchozí scan stejných obrazů:
`/srv/x5-production/archives/studio-balance/image-scans/1923ef305c679d0da28c3973e86ea3e5f886bf96/20261007T161827Z-2R5lSOD8`.

Retence chrání aktuální `1923ef3` a předchozí ověřené `0d016c0`, `817f7ff`
včetně zdrojů a obnovitelných obrazů. Zachované zálohy prošly kontrolou
velikostí a SHA-256. Cache skeneru má limit 14 dní / 2 GiB a při kontrole
obsahovala 1 438 040 290 B. Auditní scan evidence se automaticky nemaže.
Podrobnosti jsou v [provozním runbooku](production-storage.md).

## Prohlížeč a skutečné HTTP odpovědi

Izolovaný web s migrovanou testovací databází se ověřil na desktopu
a šířce 360 px včetně stavů rozvrhu a samostatného návodu pro přidání
aplikace. Mobilní návod po zavření vrátil fokus; konzole bez chyb.

V produkčním prohlížeči se načetl rozvrh a detail Latino Ladies
16. října 17:30–18:30 s Xavierem Tihelkou, fotografií, cenou 200 Kč
a stávajícím oznámením. Mobilní šířka 360 px bez vodorovného přesahu,
rozbitých fotografií či chyb konzole. Administrátorský vstup vedl na
správnou doménu Keycloak bez blokování CSP; heslo ani OTP se nezadávaly.
Kontrolní karta měla blokované analytické kolektory a byla po ověření zavřena.

Veřejné HTTP kontroly používají DNT/GPC a žádné cookies nebo zápisy.
Potvrdily unikátní nonce v CSP a všech serverem vydaných skriptech,
`private, no-store`, zákaz iframe, soukromé API 401 bez komprese,
interní cesty včetně zakódované varianty 404, kanonická přesměrování,
vyhrazený issuer a přesné schválené analytické bajty/SRI.

Při aktivaci Nginx se zachytila chybná exact location bez vlastního
`proxy_pass`: syntaxe prošla, skutečný rozvrh vracel 404. Pouze vlastní
změna se ihned vrátila z ověřené zálohy a rozvrh opět vracel 200.
Oprava má test skutečného Linux Nginx, který tuto regresi reprodukuje.
Další skutečný test odhalil vypnutí gzip při požadavku s `Via`.
Oprava zachovává gzip vypnuté pro ostatní API a upravuje pouze veřejný seznam.
[Závěrečný HTTP receipt](security-performance-http-receipt-2026-10-07.json)
dokládá aktivaci opravy: veřejný rozvrh 200, stejné rozbalené JSON,
161 971 B bez komprese / 13 891 B na síti s gzip (o 91,4 % méně).
Privátní odpovědi zůstávají bez komprese. Jde o velikost této odpovědi,
nikoli o tvrzení, že celá aplikace zrychlila o 91,4 %.

Nginx syntax, reload a kontroly upstreamů prošly. Původní bezpečná konfigurace
je v `/var/backups/studiobalance-nginx/20261007T162407.770938Z-1923ef305c67`;
záloha před poslední úzkou gzip změnou v
`/var/backups/studiobalance-nginx/20261007T165608.437577Z-1923ef305c67`.
Výsledný SHA-256 `sites-available`: `f756a94bcccc44a0c966f8b651a6ffbed6782af886457ea0f0f314f2f27eadb2`;
`sites-enabled`: `bcb9ad0115d7b5124012187a175e6cf77447b673636b07b772af28d27f395b3f`.
Soukromý analytický include je beze změny:
`291259c4b9a2c317bd8993b559d05763c786481cd9478ee37e1e481ce9972359`.

Krátké místní měření před vydáním: deset následných HTTP požadavků na cestu,
všechny 200. Medián / maximum v ms: `/` 4,77 / 20,07;
`/rozvrh` 3,42 / 4,15; `/admin/prihlaseni` 3,23 / 4,50;
`/api/v1/sessions` 3,87 / 8,71. Jde o místní odezvu na malé testovací
databázi, nikoli měření produkční zátěže či rychlosti v telefonu.

## Limity a návrat

Nebyla změněna produkční fotografie, rozvrh, registrace, účty ani již
existující rezervace. Nebylo provedeno skutečné přihlášení heslem a MFA,
90denní či fyzické telefonní ověření ani nový produkční restore drill.
Checksumy uchovaných záloh dokazují integritu souborů; nezastupují obnovu
celého systému. Nezávislé zálohování hostu včetně X5 přes Proxmox potvrdil vlastník.

Po nasazení se zaznamenaly krátké databázové chyby `/ready` 503 a
`studio-status` 500, poslední v 16:42:24 UTC. Od 16:43 do 16:52:12 UTC
nepřibyla žádná 5xx; readiness 72×200, studio-status 35×200.
Kontrola současného i předchozího poolu přes HAProxy 5000 prošla 10/10;
nový timeout se potvrzuje jako 30 s. Následné odpovědi 2–7 ms.
Sdílený host měl téměř plný swap a zvýšenou historickou zátěž, ale příčina
výpadků není prokázaná: aplikační log nezaznamenává konkrétní DB error code.
Jiné služby, proxy ani databáze se kvůli této diagnostice neměnily.

Návrat aplikace: `pnpm rollback:production -- 0d016c0` z čisté kopie.
Používá předchozí neměnný Compose a všechny tři obrazy, zachovává data
a stejné storage guardy. Nemíchat HMAC protokol starého API s novým webem.
Nginx návrat je samostatný: ověřit manifest a aktuální hashes, obnovit pouze
dva Studio Balance soubory s původními metadaty, provést `nginx -t`, reload
a skutečné HTTP ověření. Soukromý analytický include se nemění.

Reindexace byla zkusena přes Chroma MCP a následně scoped CLI. MCP
nevrátilo seznam spravovaných kořenů; CLI skončilo na odmítnutém spojení
embedding služby Ollama. Sdílená služba nebyla restartována ani změněna.
Po obnovení retrieval je nutné indexovat tuto implementační větev.

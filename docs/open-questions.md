# Otevřená rozhodnutí

## Jak dokument používat

`P0` blokuje příslušnou část implementace nebo produkční vydání. `P1` je nutné
uzavřít před dokončením dotčené funkce. Návrh odpovědi je pracovní doporučení,
nikoli souhlas zadavatele. Po rozhodnutí se závěr promítne do kanonického
dokumentu a významné technické rozhodnutí také do ADR.

## Schválená rozhodnutí 2026-08-04

| ID | Rozhodnutí | Kanonický záznam |
| --- | --- | --- |
| RD-001 | GitHub repozitář je `git@github.com:voldzi/Studio-Balance.git` | ADR 0002 |
| RD-002 | Produkční aplikace poběží v Dockeru na `docker.home.cz` | ADR 0002 |
| RD-003 | Produkční PostgreSQL se používá přes `haproxy.home.cz:5000`, ne přes přímý DB node | ADR 0002 |
| RD-004 | Lokální vývojové služby poběží v Docker Desktop a budou oddělené od produkce | ADR 0002 |
| RD-005 | PostgreSQL je zdroj pravdy pro relační data; existující S3-kompatibilní službu na `docker.home.cz` lze podle potřeby využít pro média s vlastním Studio Balance tenantem | ADR 0002 |
| RD-006 | Veřejná URL je `https://studiobalance.zeleznalady.cz` | ADR 0002 |
| RD-007 | Internetový provoz vede přes Nginx na `dmz.home.cz` do aplikace na `docker.home.cz` | ADR 0002 |
| RD-008 | Read-only inventura `docker.home.cz` identifikovala jako preferovaného kandidáta samostatnou Studio Balance gateway nad `shared-seaweedfs`; projektové MinIO se bez změny provozního modelu nesdílí | ADR 0002, infrastructure-assessment.md |
| RD-009 | Aplikační stack je TypeScript monorepo: Next.js, NestJS/Fastify, worker a `pnpm` | ADR 0003, CD-001 |
| RD-010 | Produkční databázová major verze je PostgreSQL 18; `patroni1` potvrdil 18.4 | ADR 0002, CD-002 |
| RD-011 | Produkční binární média se ukládají do vyhrazeného S3-kompatibilního tenant úložiště | ADR 0002, CD-005 |
| RD-012 | Produkt je pouze responzivní web; nativní iOS/Android aplikace ani app-store release nevznikají | ADR 0003, CD-006 |
| RD-013 | Identita používá Keycloak, realm `studio-balance`, oddělené web/admin OIDC policies, PKCE, email verification před bookingem a povinné admin MFA | ADR 0004, CD-007 |
| RD-014 | Infrastrukturní realizace postupuje interní Docker preview → DMZ publikace → produkční PostgreSQL a Keycloak | ADR 0006, CD-008 |
| RD-015 | DMZ Nginx publikace se připraví verzovaným validačním skriptem; při nedostupném SSH/sudo ji spustí správce serveru | ADR 0007, CD-009 |
| RD-016 | Rezervace se otevírá 30 dní a zavírá 30 minut před lekcí; termín může obě hodnoty přepsat | CD-004, CD-011 |
| RD-017 | Po začátku lekce mění nebo ruší rezervaci pouze administrátor | CD-011 |
| RD-018 | Administrátor může po významné změně času nebo místa aktivovat dočasné bezplatné storno | CD-011 |
| RD-019 | Podmínky se přijímají při první rezervaci a po vydání nové verze; shrnutí se zobrazuje vždy | CD-011 |
| RD-020 | Připomenutí jsou volitelná, provozní změny povinné; zákaznické preview skutečné e-maily neodesílá | CD-011, CD-012 |
| RD-021 | Neuhrazený storno poplatek rezervaci neblokuje; administrátor eviduje úhradu hotově nebo terminálem | CD-011 |
| RD-022 | Administrátor může pozvat nového klienta a účet se propojí až po ověření e-mailu | CD-011 |

## P0 – vlastnictví, obsah a značka

| ID | Otázka | Dopad / návrh dalšího kroku |
| --- | --- | --- |
| OQ-001 | Kdo je jmenovitý product owner, kdo schvaluje UX a kdo přebírá provoz? | stanovit jednu rozhodovací a jednu technickou kontaktní osobu |
| OQ-002 | Která varianta loga je poslední schválená a lze dodat SVG, transparentní PNG, favicon/app icon pravidla a ochrannou zónu? | blokuje finální design systém a produkční vizuál |
| OQ-003 | Který hero obraz a které fotografie lekcí jsou skutečné a schválené k publikaci? | reference obsahují různé varianty; produkce nesmí použít neověřený raster |
| OQ-004 | Které kontakty, sociální profily, adresa, parkování a otevírací informace jsou aktuální? | údaje z vizitky pouze ověřit, nekopírovat automaticky |
| OQ-005 | Kdy budou dodány ceny, aktuální rozvrh, instruktoři, recenze, popisy, zdravotní upozornění a právní texty? | potřeba pro prototyp s reálným obsahem i launch |

## Uzavřená produktová pravidla

Otázky OQ-006 až OQ-013 byly 2026-08-04 uzavřeny rozhodnutími CD-004,
CD-011 a CD-012. Dotazník zůstává auditním podkladem, nikoli otevřeným
blokátorem implementace.

## P0 – technická a provozní rozhodnutí

| ID | Otázka | Dopad / návrh |
| --- | --- | --- |
| OQ-015 | Jaké jsou rozpočtové a provozní limity e-mailu, monitoringu a případné CDN vrstvy? | ovlivní poskytovatele i SLA; runtime a DB topologie jsou už schválené |
| OQ-020 | Jaké RPO/RTO a retenční dobu mají databázové zálohy? | baseline je denní záloha a pravidelný test obnovy; čísla chybí |
| OQ-030 | Jaký database name, TLS režim, admin role, credentials policy a failover očekávání platí za `haproxy.home.cz:5000`? | major 18 je potvrzený; tyto údaje jsou nutné pro bezpečný produkční bootstrap skript |
| OQ-031 | Jaký image registry a finální produkční rollback workflow se použije mezi `dmz.home.cz` a `docker.home.cz`? | preview Compose/rollback řeší ADR 0006 a Nginx upstream, TLS i instalační rollback ADR 0007; preview publikace je aktivní, finální produkční workflow ještě ne |
| OQ-032 | Jak se provisionuje vyhrazená Studio Balance gateway nad `shared-seaweedfs`? | S3 použití je schválené; potvrdit interní endpoint, bucket, credentials, pinned image, healthcheck, backup/restore, vlastníka a lifecycle |
| OQ-033 | Kdo vlastní kapacitní alerty `docker.home.cz`, jaké jsou jejich prahy a jak se vyřeší téměř vyčerpaný swap? | disk byl 2026-08-04 přeměřen na přibližně 73 GiB volno, swap však zůstává produkčním rizikem; interní preview má resource limits a preflight |

## P0 – právo, data a analytika

| ID | Otázka | Dopad / návrh |
| --- | --- | --- |
| OQ-021 | Jaké jsou retenční lhůty účtu, rezervací, storno poplatků, auditů a komunikačních logů? | nutné pro návrh mazání/anonymizace a právní texty |
| OQ-022 | Kdo je správce údajů a jak se vyřizuje export/smazání v zákonné lhůtě? | doplnit proces a odpovědnou osobu |
| OQ-023 | Která analytika a cookie technologie je schválena? | implementovat jen skutečně potřebné měření a odpovídající consent |
| OQ-024 | Je kontaktní formulář součástí první verze? | pokud ano, potvrdit účel, retenční lhůtu, spam ochranu a souhlas |

## P1 – UX a obsah

| ID | Otázka | Dopad |
| --- | --- | --- |
| OQ-025 | Budou v první verzi filtry lekcí podle cíle/instruktora? | nesmí zkomplikovat základní rozvrh |
| OQ-026 | Má být ruční sekce recenzí zdrojem hvězdiček, nebo pouze textových citací? | hvězdičky jen u skutečně doložených hodnocení |
| OQ-027 | Které sociální sítě se zobrazí, zejména TikTok? | prázdná síť se nesmí zobrazit |
| OQ-028 | Má být po lekci výzva k hodnocení už v první verzi? | vyžaduje pravidlo četnosti a marketing/provozní klasifikaci |
| OQ-029 | Má „Přidat do kalendáře“ nabídnout stažitelný ICS, webové odkazy Google/Outlook/Apple, nebo obojí? | ovlivní webový tok a časové testy |

## Co lze dělat před uzavřením otázek

Lze dokončit doménový model, transakční pravidla rezervace, veřejné stavy,
bezpečnostní baseline, wireframy bez finálních assetů, testovací scénáře a
detailnější OpenAPI návrh. Produkční host, databázová cesta a možnost S3 jsou
rozhodnuté, ale nelze tvrdit, že je připraven produkční design, kapacita
hostitele, tenant médií, identity provisioning, deployment workflow ani právní
soulad, dokud nejsou uzavřeny odpovídající P0
položky.

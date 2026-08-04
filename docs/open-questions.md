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

## P0 – vlastnictví, obsah a značka

| ID | Otázka | Dopad / návrh dalšího kroku |
| --- | --- | --- |
| OQ-001 | Kdo je jmenovitý product owner, kdo schvaluje UX a kdo přebírá provoz? | stanovit jednu rozhodovací a jednu technickou kontaktní osobu |
| OQ-002 | Která varianta loga je poslední schválená a lze dodat SVG, transparentní PNG, favicon/app icon pravidla a ochrannou zónu? | blokuje finální design systém a produkční vizuál |
| OQ-003 | Který hero obraz a které fotografie lekcí jsou skutečné a schválené k publikaci? | reference obsahují různé varianty; produkce nesmí použít neověřený raster |
| OQ-004 | Které kontakty, sociální profily, adresa, parkování a otevírací informace jsou aktuální? | údaje z vizitky pouze ověřit, nekopírovat automaticky |
| OQ-005 | Kdy budou dodány ceny, aktuální rozvrh, instruktoři, recenze, popisy, zdravotní upozornění a právní texty? | potřeba pro prototyp s reálným obsahem i launch |

## P0 – produktová pravidla

| ID | Otázka | Dopad / doporučený výchozí návrh |
| --- | --- | --- |
| OQ-006 | Kdy se rezervace otevírá a zavírá vůči začátku termínu? | definovat globální default s přepisem na termínu |
| OQ-007 | Smí klient zrušit rezervaci po začátku lekce, nebo už jen administrátor? | doporučení: po začátku pouze administrátor |
| OQ-008 | Jaké bezplatné storno platí po významné změně času/místa studiem? | definovat automatické časové okno nebo explicitní admin přepínač |
| OQ-009 | Má být potvrzení storno podmínky checkboxem při každé rezervaci, nebo jen při první a nové verzi? | brief připouští obě varianty; doporučení: první rezervace + každá nová verze |
| OQ-010 | Která připomenutí může klient vypnout: 24 h, 2 h, 30 min a po-lekční zpráva? | změna/zrušení zůstávají povinný provozní e-mail |
| OQ-011 | Má neuhrazený storno poplatek pouze zobrazit upozornění, nebo někdy blokovat rezervaci? | první verze podle briefu neblokuje; potvrdit provozní očekávání |
| OQ-012 | Je interní poznámka „zaplaceno hotově/terminálem“ součástí první verze? | nejde o platební integraci, ale zvyšuje provozní rozsah a audit |
| OQ-013 | Má administrátor rezervovat i zcela nového klienta, nebo jen existující účet? | ovlivní minimální data, souhlasy a deduplikaci |

## P0 – technická a provozní rozhodnutí

| ID | Otázka | Dopad / návrh |
| --- | --- | --- |
| OQ-014 | Schvaluje se navržený TypeScript monorepo směr z ADR 0001, nebo jiný stack? | bez rozhodnutí nelze vytvořit aplikační scaffold a přesné příkazy |
| OQ-015 | Jaké jsou rozpočtové a provozní limity e-mailu, push, monitoringu a případné CDN vrstvy? | ovlivní poskytovatele i SLA; runtime a DB topologie jsou už schválené |
| OQ-017 | Jaké minimální verze iOS/Android se podporují a kdo spravuje App Store/Google Play účty? | blokuje mobilní technický základ a release pipeline |
| OQ-018 | Je admin MFA povinné už v první verzi? | doporučení: povinné pro `super_admin`, nejméně silně doporučené pro `admin` |
| OQ-019 | Musí být e-mail ověřen před první rezervací, nebo lze rezervaci vytvořit a ověření dokončit následně? | trade-off konverze vs. doručitelnost/zneužití |
| OQ-020 | Jaké RPO/RTO a retenční dobu mají databázové zálohy? | baseline je denní záloha a pravidelný test obnovy; čísla chybí |
| OQ-030 | Jaká verze PostgreSQL, database name, TLS režim, credentials policy a failover očekávání platí za `haproxy.home.cz:5000`? | lokální Docker DB musí odpovídat produkční major verzi a connection semantics |
| OQ-031 | Jaký Docker deployment mechanismus, image registry, Nginx upstream/TLS/certifikát a rollback workflow se použije mezi `dmz.home.cz` a `docker.home.cz`? | veřejná cesta je schválená, přesná release konfigurace ještě ne |
| OQ-032 | Aktivuje první verze S3 média a schvaluje se vyhrazená Studio Balance gateway nad `shared-seaweedfs`? | před aktivací potvrdit interní endpoint, bucket, credentials, pinned image, healthcheck, backup/restore, vlastníka a lifecycle; zaplnění hostitele je nejdříve nutné vyřešit |
| OQ-033 | Kdo a jak bezpečně uvolní nebo rozšíří kapacitu `docker.home.cz` a jaké alert prahy budou platit? | inventura 2026-08-04 zjistila 96% zaplnění root filesystému a vyčerpaný swap; blokuje produkční readiness, nic se automaticky nemaže |

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
| OQ-029 | Má „Přidat do kalendáře“ používat stažitelný ICS, nativní kalendář mobilu, nebo obojí? | ovlivní web, aplikaci a časové testy |

## Co lze dělat před uzavřením otázek

Lze dokončit doménový model, transakční pravidla rezervace, veřejné stavy,
bezpečnostní baseline, wireframy bez finálních assetů, testovací scénáře a
detailnější OpenAPI návrh. Produkční host, databázová cesta a možnost S3 jsou
rozhodnuté, ale nelze tvrdit, že je připraven produkční design, kapacita
hostitele, tenant médií, deployment workflow,
mobilní release ani právní soulad, dokud nejsou uzavřeny odpovídající P0
položky.

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

## P0 – vlastnictví, obsah a značka

| ID | Otázka | Dopad / návrh dalšího kroku |
| --- | --- | --- |
| OQ-001 | Kdo je jmenovitý product owner, kdo schvaluje UX a kdo přebírá provoz? | stanovit jednu rozhodovací a jednu technickou kontaktní osobu |
| OQ-002 | Která varianta loga je poslední schválená a lze dodat SVG, transparentní PNG, favicon/app icon pravidla a ochrannou zónu? | blokuje finální design systém a produkční vizuál |
| OQ-003 | Který hero obraz a které fotografie lekcí jsou skutečné a schválené k publikaci? | reference obsahují různé varianty; produkce nesmí použít neověřený raster |
| OQ-004 | Které kontakty, sociální profily, adresa, parkování a otevírací informace jsou aktuální? | údaje z vizitky pouze ověřit, nekopírovat automaticky |
| OQ-005 | Kdy budou dodány ceny, aktuální rozvrh, instruktoři, recenze, popisy, zdravotní upozornění a právní texty? | potřeba pro prototyp s reálným obsahem i launch |

## P0 – produktová pravidla

Připravené znění pro zadavatele je v
`client-questionnaire-booking-rules.md`. Otázky zůstávají otevřené, dokud
nepřijde výslovná odpověď.

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
| OQ-015 | Jaké jsou rozpočtové a provozní limity e-mailu, monitoringu a případné CDN vrstvy? | ovlivní poskytovatele i SLA; runtime a DB topologie jsou už schválené |
| OQ-020 | Jaké RPO/RTO a retenční dobu mají databázové zálohy? | baseline je denní záloha a pravidelný test obnovy; čísla chybí |
| OQ-030 | Jaký database name, TLS režim, admin role, credentials policy a failover očekávání platí za `haproxy.home.cz:5000`? | major 18 je potvrzený; tyto údaje jsou nutné pro bezpečný produkční bootstrap skript |
| OQ-031 | Jaký image registry, Nginx upstream/TLS/certifikát a produkční rollback workflow se použije mezi `dmz.home.cz` a `docker.home.cz`? | interní SHA-tagovaný Compose preview a rollback jsou uzavřené ADR 0006; veřejná release konfigurace ještě ne |
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

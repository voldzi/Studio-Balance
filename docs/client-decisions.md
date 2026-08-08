# Závazná následná rozhodnutí zadavatele

## Účel a autorita

Tento dokument zachycuje výslovná rozhodnutí zadavatele učiněná po vzniku
původního briefu. V tématech, která mění, má před původním souborem
`docs/01 Zadání/STUDIO_BALANCE_ZADANI_PRO_VYVOJ.md` přednost. Původní podklady
zůstávají beze změny jako auditní stopa.

## Rozhodnutí 2026-08-04

| ID | Rozhodnutí | Dopad |
| --- | --- | --- |
| CD-001 | Schvaluje se TypeScript monorepo a modulární monolit ve web-only rozsahu podle ADR 0003 | lze vytvořit scaffold Next.js, NestJS/Fastify, worker a sdílené balíčky přes `pnpm` |
| CD-002 | Produkční databáze používá PostgreSQL major 18 | Patroni API na `patroni1.home.cz` potvrdilo 2026-08-04 verzi 18.4 (`server_version 180004`); aplikace se stále připojuje pouze přes `haproxy.home.cz:5000` |
| CD-003 | Produkční databáze a role se později založí verzovaným interaktivním skriptem | skript si bezpečně vyžádá admin heslo při spuštění, nebude je obsahovat ani přijímat jako argument příkazové řádky a bude idempotentní |
| CD-004 | Rezervační pravidla se uzavírají doporučenými výchozími hodnotami | rezervace se otevírá 30 dní a zavírá 30 minut před začátkem s možností přepisu na termínu; po začátku mění rezervaci jen administrátor; ostatní podrobnosti shrnuje CD-011 |
| CD-005 | Produkční binární média se ukládají do S3-kompatibilního úložiště | S3 už není volitelné pro produkční media workflow; platí tenant izolace, backup a readiness podmínky z ADR 0002 |
| CD-006 | Produkt bude pouze responzivní webová aplikace | nevzniká nativní iOS/Android aplikace, Expo/React Native, App Store/Google Play release ani mobilní push infrastruktura |
| CD-007 | Schvaluje se doporučený Keycloak/OIDC identity model | vlastní realm `studio-balance`, oddělené web/admin policies, Authorization Code + PKCE, serverová HTTP-only relace, ověření e-mailu před rezervací, povinné admin MFA, issuer přes DMZ a lokální projektová instance |
| CD-008 | Realizace infrastruktury proběhne v pořadí interní Docker preview → DMZ publikace → produkční PostgreSQL a Keycloak | první řez na `docker.home.cz` musí zůstat neveřejný, bez produkčních dat/credentials a s izolovanou dočasnou databází podle ADR 0006 |
| CD-009 | Má se připravit Nginx publikace na `dmz.home.cz`; pokud není dostupný SSH/sudo přístup, předá se instalační skript | verzovaný skript podle ADR 0007 vyžaduje explicitní aktivaci, zálohu, `nginx -t`, TLS a rollback; vlastní spuštění provede správce DMZ |
| CD-010 | Produkční DB bootstrap dočasně použije přes HAProxy `sslmode=disable`; Keycloak realm použije stávající hostname `login.zeleznalady.cz` | HAProxy neposkytuje TLS a Node PostgreSQL ovladač neumí bezpečný TLS fallback na prosté spojení. Výjimka je omezená na interní trasu a je dočasná do zprovoznění `verify-full` s vlastním CA. Vyhrazený realm a přesné client callbacky jsou zachované |
| CD-011 | Schvalují se všechna doporučená rezervační pravidla z dotazníku | přesně 24 h je včasné storno; po významné změně lze termínu nastavit bezplatné storno okno; podmínky se přijímají při první rezervaci a nové verzi; neuhrazený poplatek neblokuje rezervaci; administrátor eviduje úhradu hotově/terminálem a může pozvat nového klienta s propojením po ověření e-mailu |
| CD-012 | Zákaznické preview má použít dodané logo, vizuální návrh a fotografie; e-mailové odesílání se v preview nezapíná | implementace vizuálně vychází z návrhu z 4. 8. 2026 a používá dodané rastry pouze pro preview; provozní stav se zobrazí v účtu, ale skutečné e-maily zůstávají podmínkou produkčního vydání |
| CD-013 | Zadavatel 2026-08-06 znovu potvrdil web-only rozsah, šest úrovní náročnosti a použití dodaných vizuálů v aplikaci | náročnost je součástí typu lekce, nikoli uživatelské hodnocení; dodané rastry jsou schválené preview assety; před finálním produkčním vydáním se nahradí originálními médii ve vyhrazeném S3 |
| CD-014 | Zadavatel 2026-08-07 dodal ostřejší náhradní plakátové podklady pro všech šest lekcí | nahrazují dosavadní preview rastry; konkrétní způsob zobrazení v kartě určuje novější CD-015 a finální produkční média nadále patří do schváleného S3 workflow |
| CD-015 | Zadavatel 2026-08-08 schválil jednotnou velikost plakátů v katalogu lekcí | karty používají společný formát s kontrolovaným cropem od horní hrany; název ani hlavní motiv se nesmí oříznout |
| CD-016 | Zadavatel 2026-08-08 schválil úplné zobrazení plakátu v detailu lekce | detail používá `contain` a ztlumené pozadí z téhož obrazu; katalogové karty zůstávají ve společném formátu podle CD-015 |

## Schválené náročnosti lekcí

| Lekce | Náročnost |
| --- | ---: |
| Barre | 3/5 |
| TRX | 4/5 |
| Balance Flow | 2/5 |
| Jumping | 5/5 |
| Power jóga | 3/5 |
| Kruhový trénink | 4/5 |

## Schválená identita

Zadavatel upozornil na dostupný Keycloak. Read-only kontrola našla na
`docker.home.cz` samostatný Keycloak 26.1.5 na host portu 8081. Kontejner nemá
Docker healthcheck. V aktuálním Docker Desktop contextu `desktop-linux` nebyl
Keycloak při kontrole spuštěný.

Keycloak je schválený identity provider. Závazné rozhodnutí je v ADR 0004:

- realm `studio-balance` a oddělené klientské/admin OIDC policies;
- produkční issuer `https://login.zeleznalady.cz/realms/studio-balance`;
- povinné ověření e-mailu před první rezervací;
- povinné MFA pro `admin` a `super_admin`;
- lokální projektová instance stejné hlavní verze v Docker Desktop;
- provozní healthcheck, záloha, restore, upgrade a vlastnictví.

## Dopad na původní brief

Kapitoly původního briefu věnované samostatné mobilní aplikaci, Expo/native
release, App Store/Google Play, mobilnímu secure storage, deep linkům a push
notifikacím jsou rozhodnutím CD-006 nahrazené a nejsou součástí rozsahu. Pojem
„mobil“ v aktivní dokumentaci znamená responzivní web od šířky 360 px, nikoli
samostatnou aplikaci.

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
| CD-017 | Zadavatel 2026-08-09 opravil slogan na přesné znění „Najdi si svůj balanc.“ | novější znění nahrazuje variantu „balans“ v původním briefu a používá se jednotně na veřejném webu |
| CD-018 | Zadavatel 2026-08-09 schválil pás skutečných recenzí na titulní stránce | recenze se ručně spravují v administraci, publikace vyžaduje doložený souhlas a hvězdičky se zobrazí jen u skutečně předaného hodnocení; automatický sběr hodnocení není tímto rozhodnutím schválen |
| CD-019 | Zadavatel 2026-08-10 dodal první skutečnou recenzi s výslovným souhlasem autorky | recenze Markety Šímové se publikuje bez hvězdiček, protože číselné hodnocení nebylo dodáno; je přiřazená k TRX a může být zvýrazněná na titulní stránce |
| CD-020 | Barre se rozlišuje na samostatné typy Barre Sculpt a Barre Strength | Barre Sculpt znamená tvarování postavy, Barre Strength sílu a stabilitu; oba typy zůstávají administračně spravovanými daty a dočasně používají společný schválený Barre vizuál |
| CD-021 | Zadavatel dodal pevný týdenní rozvrh a kapacity lekcí | TRX má 8 míst, Balance Flow 10, Kruhový trénink 16, Jumping 16 a Power Yoga 16; Barre má předběžně 10 míst a čeká na konečné potvrzení; produkční série se nezaloží s domyšlenými cenami |
| CD-022 | První ověřovací termín je TRX v pondělí 17:00–18:00 za 160 Kč s kapacitou 8 | nejbližší budoucí termín se založí na 17. 8. 2026 a umožní ověřit celý veřejný rezervační tok |
| CD-023 | Pevný týdenní rozvrh platí od 10. 8. 2026 | datum účinnosti už není otevřené; termíny se zveřejňují podle potvrzeného rozvrhu a cen, kapacita Barre zůstává dočasně 10 míst |
| CD-024 | TRX stojí 160 Kč a všechny ostatní lekce mají jednotnou cenu 299 Kč | celý pevný rozvrh lze zveřejnit v aktuálním 30denním rezervačním horizontu; ceny se ukládají na konkrétním termínu pro správný rezervační a storno tok |
| CD-025 | Novější kompletní rozvrh nahrazuje cenovou část CD-024 a potvrzuje lektorky | Barre Sculpt a Barre Strength stojí 250 Kč; TRX, Balance Flow, Kruhový trénink, Jumping a Power Yoga stojí 160 Kč; přiřazení lektorek je závazné podle tabulky níže |
| CD-026 | Veřejné sociální profily Studia Balance jsou Instagram `studiobalancenl` a dodaný Facebook profil | odkazy se zobrazí v kontaktní stránce a společném footeru; sledovací parametry Instagramu se neukládají |
| CD-027 | Šest dodaných referencí od Heleny Šimkové, Evy Gaidadzi, Moniky Jendrišákové, Veroniky Škobrtalové, Lenky Zvyhalové a Hany Dokládalové je schváleno k publikaci | reference se přiřadí k TRX nebo Jumpingu, publikují bez nedodaného hvězdičkového hodnocení a s daty 2.–7. 8. 2026 |
| CD-028 | Zadavatel 2026-08-11 ověřil kapacity a opravil cenu Balance Flow Board | kapacity jsou TRX 8, Balance Flow 10, Kruhový trénink 16, Jumping 16 a Power Yoga 16; Barre Sculpt i Barre Strength zůstávají do potvrzení na dočasných 10. Cena Balance Flow je 200 Kč, ostatní ceny z CD-025 zůstávají beze změny. |
| CD-029 | Veřejný web může fungovat jako instalovatelná PWA | jde stále o responzivní web, nikoli nativní aplikaci. PWA poskytuje manifest, ikonu, bezpečné ukládání statických souborů a stránku bez připojení; rozvrh, účet, API a rezervace se offline neukládají ani neprovádějí. |
| CD-030 | Skutečné proměny klientek před/po spravuje administrátorka | každá položka vyžaduje dvě skutečné fotografie, pravdivý popis a doložený výslovný souhlas s fotografiemi, textem a uvedeným jménem; bez souhlasu ji nelze publikovat. Fotografie patří do vyhrazeného Studio Balance S3 úložiště a nesmějí obsahovat zavádějící úpravy ani nepodložené zdravotní sliby. |
| CD-031 | Administrace obsahuje kontextovou nápovědu | otazníky vysvětlují zejména kapacitu, cenu, pořadí, publikování, souhlas a práci s fotografiemi; nápověda je dostupná myší, dotykem i klávesnicí a nenahrazuje validační hlášení. |
| CD-032 | Klientská registrace je jednoduchá a nevyžaduje e-mailové ověření | Keycloak po registraci neodesílá ověřovací e-mail; klient může po doplnění jména, příjmení, telefonu a přijetí podmínek rezervovat. Reset hesla se zpřístupní až po budoucím zprovoznění SMTP. |
| CD-033 | Administrátorský přístup vyžaduje TOTP | klient `studiobalance-admin` používá oddělený přihlašovací tok, který po heslu vždy vyžaduje ověřovací kód; účet bez nastavené aplikace musí nejprve dokončit její registraci. |
| CD-034 | Zadavatel schválil 13. 8. 2026 prémiový mobilní směr klientské webové aplikace | instalovatelná PWA používá krémovou, hnědou a zlatavou paletu, oficiální logo, schválené fotografie, přivítání, nejbližší rezervaci, rychlé storno, novinky, zprávy, oblíbené a spodní navigaci Domů / Rozvrh / Rezervace / Oblíbené / Profil. Jde stále o responzivní web napojený na stejnou databázi; číselná volná místa, permanentky a nativní mobilní aplikace zůstávají mimo rozsah. |
| CD-035 | Zadavatel doplnil úplná jména lektorů a potvrdil ceny podle konkrétních lekcí | Kruhový trénink vede Tereza Sitková, nedělní Jumping Monika Kubincová, Power Yoga Xavier Tihelka, úterní Barre Nicola Lojšková, ranní Barre Katka Adamovská, středeční Jumping, TRX a Balance Flow Nicola Lojšková. Barre stojí 250 Kč, Balance Flow 200 Kč a ostatní uvedené lekce 160 Kč. |
| CD-036 | Mobilní veřejné menu musí jednoznačně zpřístupnit klientský účet a vysvětlit samostatnou stránku Balance Flow | menu používá texty „Všechny lekce“, „Rozvrh a rezervace“, „Metoda Balance Flow“ a oddělenou položku „Přihlásit / Můj účet“; nepřihlášený návštěvník je po otevření účtu veden na přihlášení |
| CD-037 | Zadavatel 13. 8. 2026 odstranil samostatnou metodu Balance Flow z veřejného mobilního menu | stránka a zvýraznění metody na homepage zůstávají dostupné, ale hlavní mobilní navigace obsahuje jen obecné cíle; otevřený panel se zavře klepnutím mimo něj, výběrem odkazu nebo klávesou Escape |
| CD-038 | Administrátor vstupuje do správy studia ze svého klientského profilu | položku vidí pouze účet s rolí `admin` nebo `super_admin`; platná admin relace otevře správu přímo, jinak následuje bez mezistránky čerstvé administrátorské ověření heslem a TOTP, přičemž klientský e-mail může být předvyplněn |
| CD-039 | Přechod z přihlášeného administrátorského profilu do správy je automatický | rozhodnutí nahrazuje opakované ověření při přechodu popsané v CD-038: platná serverová webová relace s rolí `admin` nebo `super_admin` se uznává i pro správu. MFA zůstává povinné při přihlášení administrátorského účtu; přímý vstup do `/admin` bez platné webové nebo admin relace používá oddělené heslo a TOTP. |
| CD-040 | Přihlášení má na soukromém zařízení zůstávat použitelné déle, bez opakování hesla a OTP při každém vstupu | toto rozhodnutí nahrazuje CD-039 v části, která ztotožňovala běžnou klientskou a admin relaci. Browser obsahuje pouze neprůhlednou HTTP-only cookie, relace a šifrovaný obnovovací token jsou na serveru. Bez zaškrtnutí je cookie do zavření prohlížeče; se zaškrtnutím je zařízení důvěryhodné nejvýše 90 dní při aktivitě aspoň jednou za 30 dní. Server nejpozději po 15 minutách ověří účet i role v Keycloaku. Administrace vznikne pouze po samostatném hesle a TOTP, pak používá stejný režim důvěryhodného zařízení; běžná klientská relace, i s admin rolí, do správy nestačí. Odhlášení zruší obě relace na daném zařízení. |
| CD-041 | Administrátor se přihlašuje do klientské aplikace i správy jednou | rozhodnutí nahrazuje CD-040 pouze v oddělení klientské a admin relace: účet s rolí `admin` nebo `super_admin` dokončí při běžném přihlášení heslo a OTP; podepsaný údaj AMR se uloží jako neměnný důkaz MFA v serverové relaci. Tato relace pak otevře správu bez dalšího přihlášení. Role bez důkazu OTP nestačí. Oddělený admin klient zůstává bezpečnou záložní cestou pro přímý nebo obnovovací vstup. Limity 90 dní, 30 dní neaktivity a revalidace do 15 minut zůstávají beze změny. |
| CD-042 | Zadavatelka 24. 8. 2026 schválila provozní zpřesnění obsahu a administrace | neplatné instruktorky Barča a Týna se bezpečně skryjí se zachováním historie; klient si bere sportovní oblečení, pohodlnou obuv a pití, zatímco cvičební pomůcky zajišťuje studio; profil nabídne změnu vlastního stálého hesla přes Keycloak a admin MFA zůstává povinné; PWA návod rozlišuje skutečné tlačítko od kroků v menu prohlížeče; dashboard ukazuje návštěvnost a oblíbenost, ale bez evidence zaplacení smí finanční údaj označit pouze jako odhad hodnoty návštěv, nikoli tržbu. |
| CD-043 | Zadavatel 24. 8. 2026 pořídil vlastní doménu `studio-balance.cz` a odmítl provozní závislost produktu na doméně `zeleznalady.cz` | kanonická adresa je `https://studio-balance.cz`, `www` přesměruje na kanonickou adresu a produkční realm používá issuer `https://login.studio-balance.cz/realms/studio-balance`; konfigurace Studio Balance nevytváří ani nevyžaduje hostname na `zeleznalady.cz` |

## Schválený týdenní rozvrh 2026-08-10

| Den | Čas | Lekce | Lekci vede |
| --- | --- | --- | --- |
| pondělí | 17:00–18:00 | TRX | Nicola Lojšková |
| pondělí | 18:10–19:10 | Balance Flow | Nicola Lojšková |
| úterý | 17:00–18:00 | Barre Sculpt | Nicola Lojšková |
| úterý | 18:15–19:15 | Kruhový trénink | Tereza Sitková |
| středa | 16:00–17:00 | TRX | Nicola Lojšková |
| středa | 17:15–18:15 | Jumping | Nicola Lojšková |
| čtvrtek | 8:30–9:30 | Barre Strength | Katka Adamovská |
| čtvrtek | 17:00–18:00 | Balance Flow | Nicola Lojšková |
| čtvrtek | 18:15–19:15 | Kruhový trénink | Tereza Sitková |
| pátek | 17:30–18:30 | Power Yoga | Xavier Tihelka |
| neděle | 16:00–17:00 | Jumping | Monika Kubincová |
| neděle | 18:00–19:00 | Power Yoga | Xavier Tihelka |

| Lekce | Maximální kapacita |
| --- | ---: |
| TRX | 8 |
| Balance Flow | 10 |
| Barre Sculpt | přibližně 10, čeká na potvrzení |
| Barre Strength | přibližně 10, čeká na potvrzení |
| Kruhový trénink | 16 |
| Jumping | 16 |
| Power Yoga | 16 |

| Lekce | Cena |
| --- | ---: |
| Barre Sculpt | 250 Kč |
| Barre Strength | 250 Kč |
| TRX | 160 Kč |
| Balance Flow | 200 Kč |
| Kruhový trénink | 160 Kč |
| Jumping | 160 Kč |
| Power Yoga | 160 Kč |

Celý rozvrh je obsahově finální a platí od 10. 8. 2026. U obou Barre variant
se do konečného potvrzení používá předběžná kapacita 10 míst.

## Schválené náročnosti lekcí

| Lekce | Náročnost |
| --- | ---: |
| Barre Sculpt | 3/5 |
| Barre Strength | 3/5 |
| TRX | 4/5 |
| Balance Flow | 2/5 |
| Jumping | 5/5 |
| Power Yoga | 3/5 |
| Kruhový trénink | 4/5 |

## Schválená identita

Zadavatel upozornil na dostupný Keycloak. Read-only kontrola našla na
`docker.home.cz` samostatný Keycloak 26.1.5 na host portu 8081. Kontejner nemá
Docker healthcheck. V aktuálním Docker Desktop contextu `desktop-linux` nebyl
Keycloak při kontrole spuštěný.

Keycloak je schválený identity provider. Závazné rozhodnutí je v ADR 0004:

- realm `studio-balance` a oddělené klientské/admin OIDC policies;
- produkční issuer `https://login.studio-balance.cz/realms/studio-balance`;
- jednoduchá klientská registrace bez e-mailového ověření; před první rezervací se doplní profil a přijmou podmínky;
- povinné MFA pro `admin` a `super_admin`;
- lokální projektová instance stejné hlavní verze v Docker Desktop;
- provozní healthcheck, záloha, restore, upgrade a vlastnictví.

## Dopad na původní brief

Kapitoly původního briefu věnované samostatné mobilní aplikaci, Expo/native
release, App Store/Google Play, mobilnímu secure storage, deep linkům a push
notifikacím jsou rozhodnutím CD-006 nahrazené a nejsou součástí rozsahu. Pojem
„mobil“ v aktivní dokumentaci znamená responzivní web od šířky 360 px, nikoli
samostatnou aplikaci.

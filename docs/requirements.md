# Produktové požadavky a obchodní pravidla

## Účel a status

Tento dokument je vývojový baseline odvozený z původního briefu verze 1.0 a
novějších závazných rozhodnutí v `client-decisions.md`. Zkracuje zadání do
testovatelných pravidel a priorit. Následné rozhodnutí má v tématu, které
výslovně mění, před původním briefem přednost.

Priorita `P0` znamená podmínku vydání první verze, `P1` hodnotnou součást první
verze, kterou lze po schválení etapizovat, a `P2` budoucí rozšíření.

## Produktový výsledek

Studio Balance získá jeden responzivní webový produkt se třemi povrchy:

1. indexovatelný veřejný web;
2. klientský účet a rezervace;
3. webovou administraci.

Všechny povrchy používají stejné účty, lekce, termíny, rezervace, obsahová data
a obchodní pravidla.

## Neporušitelné hranice P0

| ID | Požadavek / invariant | Ověření |
| --- | --- | --- |
| INV-001 | žádná online platba, checkout ani ukládání karet | UI/API/data model neobsahují platební cestu |
| INV-002 | platba probíhá až ve studiu hotově nebo fyzickým terminálem | informace před potvrzením i v potvrzení |
| INV-003 | žádné online permanentky ani zůstatky vstupů | účet, API i administrace nemají pass ledger |
| INV-004 | veřejnost nikdy neuvidí kapacitu ani počet zbývajících míst | API vrací jen veřejný stav dostupnosti |
| INV-005 | žádná čekací listina ani automatické obeslání po uvolnění místa | chybí endpoint, entita i CTA waitlistu |
| INV-006 | jedna databáze rezervací pro veřejný/klientský web a administraci | změna je okamžitě viditelná ve všech webových površích |
| INV-007 | rozvrh je veřejný, účet je nutný až pro rezervaci | anonymní cesta končí až na potvrzení rezervace |
| INV-008 | časové pásmo lekcí je `Europe/Prague` | testy standardního i letního času |
| INV-009 | přesně 24 hodin před začátkem je storno včas, o sekundu později už pozdní | hraniční testy na serveru |
| INV-010 | zrušení studiem nikdy nezaloží storno poplatek | stav rezervace i fee tabulka |
| INV-011 | nevzniká nativní iOS/Android aplikace ani app-store release | PWA zůstává instalovatelným responzivním webem; repozitář neobsahuje Expo/React Native workspace ani mobilní push provider |

## Veřejný web

| ID | Priorita | Požadavek |
| --- | --- | --- |
| WEB-001 | P0 | responzivní web od 360 px se schváleným logem, reálným hero obrazem, sloganem a CTA na rozvrh |
| WEB-002 | P0 | veřejné stránky Domů, O studiu, Lekce, detail lekce, Rozvrh, Balance Flow, Galerie, Recenze, Ceník, Kontakt, FAQ a právní stránky |
| WEB-003 | P0 | veřejný týdenní rozvrh; na mobilu výběr dne a svislý seznam, ne sedmidenní stísněná tabulka |
| WEB-004 | P0 | termín ukazuje čas, typ lekce, instruktora a jeden veřejný stav bez počtu míst |
| WEB-005 | P0 | detail termínu obsahuje datum, čas, příchod, místo, instruktora, cenu, pomůcky, vhodnost, platbu ve studiu a storno |
| WEB-006 | P1 | domovská stránka ukazuje několik nejbližších termínů a 3–6 skutečných schválených recenzí; bez publikovaného obsahu nevytváří náhradní citace |
| WEB-007 | P1 | web může ukázat skutečné proměny před/po jen s doloženým souhlasem; při nulovém počtu publikovaných proměn se sekce na titulní stránce nezobrazuje |
| WEB-007 | P1 | galerie má lightbox, ovládání klávesnicí, Escape, alt text a optimalizované obrazy |
| WEB-008 | P1 | SEO: title, description, canonical, sitemap, robots, Open Graph a vhodná strukturovaná data |
| WEB-009 | P0 | každý aktivní typ lekce má veřejný detail se schválenou fotografií, náročností 1–5, vhodností, přínosy, pomůckami, praktickou informací a nejbližšími termíny bez počtu volných míst |
| WEB-010 | P0 | klientský účet ukazuje potvrzení rezervace a důležité změny termínu jako zprávy v účtu |
| WEB-011 | P1 | web má PWA manifest, oficiální instalovací ikonu, bezpečnou cache pouze statických assetů a pravdivý offline stav; nikdy necachuje API, stav účtu, rozvrh ani rezervace jako použitelné offline údaje |

Aktuální typy lekcí jsou Barre Sculpt, Barre Strength, TRX, Balance Flow,
Jumping, Kruhový trénink a Power Yoga. Jde o data spravovaná administrací, ne
enum nebo pevné karty v kódu. Barre Sculpt se zaměřuje na tvarování postavy,
Barre Strength na sílu a stabilitu.
Administrace spravuje také náročnost, publikum, přínosy, praktické informace,
SEO a schválenou cestu fotografie typu lekce.

## Účet a autentizace

| ID | Priorita | Požadavek |
| --- | --- | --- |
| IDN-001 | P0 | registrace jménem, příjmením, e-mailem, telefonem a bezpečným přihlašovacím prostředkem |
| IDN-002 | P0 | přihlášení e-mailem, odhlášení, změna hesla a bezpečná relace; reset hesla se zpřístupní po zprovoznění SMTP |
| IDN-003 | P0 | po přihlášení během rezervace návrat na původně vybraný termín |
| IDN-004 | P0 | verze podmínek a čas přijetí jsou evidovány; marketingový souhlas je oddělený a nepředvyplněný |
| IDN-005 | P0 | klient vidí a mění jen vlastní profil a rezervace; administrátor používá oddělený vstup |
| IDN-006 | P1 | klient může požádat o export údajů a zrušení účtu |
| IDN-007 | P0 | identita používá Keycloak realm `studio-balance`, OIDC Authorization Code + PKCE a serverovou HTTP-only relaci |
| IDN-008 | P0 | klient může vytvořit rezervaci po doplnění jména, příjmení a telefonu a po přijetí podmínek; e-mailové ověření se nevyžaduje |
| IDN-009 | P0 | `admin` a `super_admin` musí dokončit MFA; klientská MFA není v první verzi povinná |

Datum narození a nouzový kontakt se v první verzi nesbírají.

## Rezervace a kapacita

| ID | Priorita | Požadavek |
| --- | --- | --- |
| BKG-001 | P0 | před potvrzením se znovu ověří stav termínu, časové okno a kapacita |
| BKG-002 | P0 | transakce zabrání překročení kapacity při souběžných požadavcích |
| BKG-003 | P0 | jeden klient nemůže mít dvě aktivní rezervace téhož termínu |
| BKG-004 | P0 | opakované odeslání nebo dvojklik je idempotentní |
| BKG-005 | P0 | rezervace ukládá zdroj `web` nebo `admin` a snapshot podmínek |
| BKG-006 | P0 | potvrzení obsahuje lekci, datum, čas, vypočtený příchod, místo, platbu ve studiu a storno pravidlo |
| BKG-007 | P1 | potvrzení nabízí kalendář, navigaci, moje rezervace a návrat na rozvrh |
| BKG-008 | P1 | účet rozlišuje nadcházející rezervace a historii všech stavů |

Veřejný stav termínu je pouze `bookable`, `full`, `closed`, `cancelled` nebo
`completed`. Interní kapacita ani počet rezervací nesmí proniknout do veřejné
odpovědi, analytiky v prohlížeči ani přístupnostního popisku.

Rezervace se standardně otevírá 30 dní a zavírá 30 minut před začátkem.
Administrátor může obě hodnoty přepsat na konkrétním termínu. Po začátku lekce
může rezervaci změnit nebo zrušit už jen administrátor. Neuhrazený storno
poplatek rezervaci neblokuje.

## Storno, docházka a poplatek

```text
reserved
 ├─> cancelled_on_time
 ├─> cancelled_late ─> cancellation fee: due
 ├─> attended
 ├─> no_show ─────────> cancellation fee: due
 └─> cancelled_by_studio (bez poplatku)
```

| ID | Priorita | Požadavek |
| --- | --- | --- |
| CAN-001 | P0 | cutoff se uloží a vyhodnotí serverem podle skutečného okamžiku začátku |
| CAN-002 | P0 | včasné storno uvolní kapacitu a nevytvoří fee |
| CAN-003 | P0 | pozdní storno nejprve ukáže cenu a vyžádá výslovné potvrzení |
| CAN-004 | P0 | pozdní storno nebo neúčast vytvoří právě jeden fee ve výši snapshotu ceny lekce |
| CAN-005 | P0 | fee má stavy `due`, `settled`, `waived`, `cancelled`; nevyvolá online inkaso |
| CAN-006 | P0 | administrativní změna stavu, prominutí nebo oprava vyžaduje auditní záznam a důvod |
| CAN-007 | P0 | zrušení termínu studiem zruší aktivní rezervace, zabrání dalším rezervacím a oznámí změnu |
| CAN-008 | P1 | významná změna času, instruktora nebo místa uloží původní i novou hodnotu a upozorní dotčené klienty |

## Doporučený příchod

Výchozí hodnota je 10 minut. Lze ji přepsat na úrovni studia, typu lekce a
konkrétního termínu; nejkonkrétnější hodnota vyhrává. Vypočtený čas se zobrazuje
v detailu, potvrzení, e-mailu, klientském účtu a kalendáři.

## Oznámení

| ID | Priorita | Požadavek |
| --- | --- | --- |
| NTF-001 | P0 | povinné kanály jsou e-mail a stav v klientském účtu; SMS a mobilní push jsou mimo první verzi |
| NTF-002 | P0 | potvrzení, storno, změna a zrušení jsou navázány na správnou rezervaci a doručují se idempotentně |
| NTF-003 | P0 | výchozí připomenutí se plánují 24 h, 2 h a 30 min před začátkem a ukládají se do trvalého provider-agnostického outboxu |
| NTF-004 | P0 | změna nebo zrušení termínu se vždy odešle e-mailem a zobrazí v klientském účtu |
| NTF-005 | P0 | změna nebo zrušení rezervace zneplatní neaktuální naplánované zprávy |
| NTF-006 | P1 | odkaz v e-mailu otevře po bezpečném přihlášení konkrétní rezervaci nebo novinku |
| NTF-007 | P1 | marketingová komunikace má samostatný odvolatelný souhlas a neblokuje službu |

Zákaznické preview e-mailového poskytovatele neaktivuje a žádné skutečné
zprávy neodesílá. Potvrzení rezervace a změny jsou dostupné v klientském účtu.
Tento preview režim nemění produkční požadavky NTF-001 až NTF-005; před ostrým
provozem se musí doplnit a ověřit doručování.

## Web-only rozsah

- Produkt je responzivní web od 360 px; nevzniká samostatná nativní aplikace,
  instalační wrapper ani app-store release.
- Klientský účet na webu zpřístupní nejbližší rezervaci, historii, storno,
  profil a provozní zprávy.
- Mobilní browser dostává plnohodnotný responzivní tok, nikoli omezenou
  sekundární verzi.
- Mobilní push, APNs/FCM a native deep links jsou mimo rozsah. PWA smí uložit
  pouze statickou webovou vrstvu a offline obrazovku; online rozvrh, účet a
  rezervace se nikdy nevydávají za aktuálně použitelné offline údaje. Změny
  lekcí mají povinný e-mailový fallback.

## Administrace a obsah

Administrace je responzivní web pro notebook a tablet. P0 zahrnuje dashboard,
typy lekcí, instruktory, jednorázové a opakované termíny, výjimky, rezervace,
docházku, klienty, storno poplatky, novinky, galerii, recenze, webový obsah,
nastavení a auditní log.

Administrátor musí bez nasazení nové verze upravit běžný text, fotografie,
kontakty, ceník, FAQ, recenze, novinky, instruktory, typy lekcí a termíny.
Administrace navíc spravuje proměny klientek jako koncept/publikovaný obsah,
včetně dvojice fotografií, pořadí, vazby na lekci a doloženého souhlasu. Citlivá
pole mají stručnou kontextovou nápovědu dostupnou i z klávesnice.
Rozvrh se nesmí hardcodovat z referenčního obrázku.

Recenze je prostý text se schváleným jménem nebo iniciálou, volitelným zdrojem,
volitelným datem, volitelnou vazbou na lekci a volitelným skutečným hodnocením
1–5.
Publikace bez doloženého souhlasu je odmítnuta databází i API. Skrytí se provádí
deaktivací/publikací, nikoli destruktivním smazáním, a změny se auditují.

Role:

- `visitor`: veřejné čtení a rozvrh;
- `client`: vlastní profil, rezervace, storna a preference;
- `admin`: provozní a obsahová správa;
- `super_admin`: administrátoři, kritická nastavení, audit a exporty.

## Kvalitativní požadavky

| Oblast | P0 baseline |
| --- | --- |
| přístupnost | WCAG 2.2 AA, klávesnice, fokus, kontrast, labely, reduced motion |
| výkon | optimalizované fotografie, lazy loading, cache veřejného obsahu, rychlá rezervace |
| bezpečnost | HTTPS, hash hesel, rate limit, bezpečný reset, RBAC, audit, bezpečný upload |
| soukromí | minimalizace údajů, verze souhlasů, export/smazání, retenční pravidla |
| spolehlivost | denní automatická záloha a ověřená obnova |
| provoz | dev/test/prod, strukturované logy, request ID, health/readiness, monitoring |
| infrastruktura | `studiobalance.zeleznalady.cz` přes Nginx na `dmz.home.cz` do Dockeru na `docker.home.cz`; PostgreSQL pouze přes `haproxy.home.cz:5000`; lokálně Docker Desktop |
| perzistence | PostgreSQL je zdroj pravdy pro relační a rezervační data; média lze uložit do S3-kompatibilní služby na `docker.home.cz` pouze v samostatném Studio Balance bucketu s oddělenými credentials, zálohou a řízenou síťovou cestou |
| kompatibilita | současné Safari iOS/macOS, Chrome Android/desktop, Edge a Firefox jako webové prohlížeče |
| lokalizace | první verze `cs-CZ`, čas `Europe/Prague`, srozumitelné české chyby |
| export | rezervace a provozní seznamy lze exportovat do CSV |

## P1 a volitelné prvky první verze

Po potvrzení zadavatelem lze zahrnout jednoduché filtry lekcí, kontaktní
formulář se spam ochranou, kalendářovou událost, interní poznámku o způsobu
platby, hodnocení po lekci a základní soukromí respektující analytiku.
Volitelnost neznamená automatické schválení; rozhodnutí eviduje
`open-questions.md`.

## P2 / budoucnost

Účet instruktora, workshopy, akce, certifikace, dárkové poukazy, více poboček,
vícejazyčnost, externí kalendáře, sociální přihlášení a marketingová
automatizace jsou mimo první verzi. Ani budoucí architektura nesmí bez nového
rozhodnutí předpokládat platby nebo permanentky.

## Definice připravenosti na implementaci

Funkce je připravena, když má vlastníka rozhodnutí, uzavřené P0 otázky, data a
oprávnění, pozitivní i chybové stavy, přístupnostní očekávání, API kontrakt,
testovatelná kritéria a schválený obsah/asset tam, kde je potřeba.

## Traceability

- web a design: brief kapitoly 3–18, 45–47, 50, 52–55;
- účet a rezervace: kapitoly 19–26, 42, 56 a TC-01 až TC-08;
- oznámení: původní brief kapitola 27; mobilní kapitoly 28–30 a 57 jsou nahrazené CD-006;
- administrace a data: kapitoly 31–44;
- bezpečnost a soukromí: kapitoly 48–49;
- NFR, realizace a předání: kapitoly 59–67.

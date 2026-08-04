# Evidence a priorita vstupních podkladů

## Účel

Dokument zaznamenává, co bylo analyzováno, jakou má podklad autoritu a jak se
má použít při návrhu. Zabraňuje tomu, aby starší screenshot nebo líbivá
vizualizace omylem změnily schválené funkční zadání.

## Pořadí autority

1. **Závazná následná rozhodnutí:** `docs/client-decisions.md`; mají přednost
   pouze v tématech, která výslovně mění.
2. **Původní závazný brief:** `docs/01 Zadání/STUDIO_BALANCE_ZADANI_PRO_VYVOJ.md`,
   verze 1.0, stav „Závazné funkční a UX/UI zadání pro vývoj“.
3. **Aktivní vývojová dokumentace:** plochá sada v `docs/`.
4. **API kontrakt:** `openapi/openapi.json` pro cesty a schémata, která již
   obsahuje.
5. **Doplňkové textové podklady:** tři jednorázové dokumenty Word.
6. **Vizuální reference:** rasterové obrázky a screenshoty.

Při rozporu platí výše uvedené pořadí. Rozsah lze změnit jen výslovným
rozhodnutím zadavatele, aktualizací briefu/požadavků a podle významu také ADR.

## Doplňující rozhodnutí zadavatele

Dne 2026-08-04 zadavatel doplnil provozní zadání:

- repozitář `git@github.com:voldzi/Studio-Balance.git`;
- veřejná URL `https://studiobalance.zeleznalady.cz`;
- Nginx internetový vstup na `dmz.home.cz`;
- produkční Docker runtime na `docker.home.cz`;
- produkční PostgreSQL přes `haproxy.home.cz:5000`;
- produkční média v existujícím S3-kompatibilním úložišti na `docker.home.cz`;
- lokální vývoj přes Docker Desktop.

Zadavatel následně schválil TypeScript web-only stack, vyřadil nativní
iOS/Android aplikaci a určil PostgreSQL major 18. Patroni API potvrdilo na
`patroni1.home.cz` verzi 18.4. Schválil také Keycloak/OIDC model, email
verification před bookingem a admin MFA. Rozhodnutí jsou v
`client-decisions.md`, ADR 0002, ADR 0003 a ADR 0004. První technickou
implementační baseline zaznamenává ADR 0005; nemění produktový rozsah.
Databázové TLS/role parametry a Docker deployment mechanismus zůstávají
otevřené. Read-only inventura hostitele je
zaznamenána v `infrastructure-assessment.md`; neobsahuje credentials ani změny
provozu.

## Analyzované textové podklady

### Závazný Markdown

Soubor má 3 062 řádků, 67 hlavních kapitol a pokrývá:

- produktovou vizi, cílové skupiny a informační architekturu;
- web, rozvrh, rezervace, mobilní aplikaci a administraci;
- storno, kapacitu, oznámení a přesné systémové texty;
- logický datový model, stavové automaty a návrh API;
- přístupnost, výkon, bezpečnost, soukromí, SEO a analytiku;
- akceptační kritéria, deset testovacích scénářů, fáze realizace a předání.

Jde o jediný podklad, který sám výslovně řeší kolize se staršími návrhy.

### Dokumenty Word

| Soubor | Obsah | Interpretace |
| --- | --- | --- |
| `Studio_Balance_Webovky.docx` | jednostránkový souhrn webu, značky, lekcí a SEO | potvrzuje, ale nerozšiřuje brief |
| `Studio_Balance_Rezervacni_System.docx` | jednostránkový souhrn rezervací, notifikací, platby ve studiu a storna | potvrzuje klíčová obchodní pravidla |
| `Studio_Balance_Aplikace.docx` | jednostránkový souhrn mobilních obrazovek a notifikací | historická reference; nativní aplikaci později vyřadilo CD-006 |

Všechny tři dokumenty byly vyrenderovány a vizuálně zkontrolovány. Neobsahují
další požadavky, které by měly přednost před hlavním briefem.

## Analyzované obrazové podklady

Ve složce je 14 JPEG souborů, ale jen 9 unikátních obrazů; 5 souborů jsou
bitově shodné kopie pod jiným názvem. Originály se ponechávají, protože jde o
podklady zadavatele.

Unikátní obsah zahrnuje:

- kompozitní koncept desktopového webu, rozvrhu, rezervací a mobilních obrazovek;
- tři screenshoty současného/ukázkového mobilního rezervačního systému;
- samostatný rasterový logotyp na světlém pozadí;
- horizontální značkový banner se sloganem;
- kontaktní grafiku s QR kódy a seznamem lekcí;
- širokou fotografickou nebo vizualizační referenci interiéru se zrcadlem;
- náhled šesti propagačních plakátů jednotlivých lekcí.

## Co lze z obrazů převzít

- teplou krémovou, béžovou, cappuccino a měděnou atmosféru;
- velkorysé fotografie, serifové nadpisy a jednoduchý sans-serif pro provozní
  informace;
- důraz na hero se zrcadlem, klidné rozvržení a jednotnou značku;
- typy lekcí, skutečné pomůcky a potřebu kvalitního detailu termínu;
- kontaktní a sociální kanály pouze po ověření aktuálnosti.

## Co se z obrazů převzít nesmí

- číselné údaje „volno: N“ nebo jiné zveřejnění kapacity;
- čekací listina nebo upozornění na uvolněné místo;
- referral sleva nebo věrnostní funkce z konceptu;
- ceny, časy, jména, kontakty nebo rozvrh bez potvrzení zadavatelem;
- obsah starého externího rezervačního systému jako cílový UX vzor;
- raster jako náhrada požadovaného produkčního SVG loga;
- domněnka, že referenční interiér nebo postery jsou schválené reálné
  produkční fotografie.

## Zjištěné kolize a rizika interpretace

| Podklad | Zobrazený prvek | Závazné pravidlo | Rozhodnutí |
| --- | --- | --- | --- |
| kompozitní koncept | počty volných míst | klient počet míst neuvidí | nepřebírat |
| kompozitní koncept | „Přiveď kamarádku“ a sleva | referral/věrnost není v rozsahu | nepřebírat |
| staré screenshoty | stísněná týdenní tabulka | responzivní web má na úzkém viewportu svislý seznam podle dne | použít jen jako příklad problému |
| logo/interiér | různé varianty značky | produkce smí použít jen poslední schválené logo | vyžádat SVG/PNG a potvrzení varianty |
| plakáty | marketingová tvrzení a fotografie | texty a reálné pomůcky schvaluje provozovatelka | nepovažovat za finální obsah |

## Chybějící produkční podklady

Před produkčním použitím je nutné potvrdit nebo dodat: finální logo v SVG a
PNG, schválený hero obraz, reálné fotografie lekcí a instruktorů, přesné
kontakty, ceník, rozvrh, texty, recenze, právní dokumenty, parkování, sociální
profily a mapu. App Store/Google Play assety se po rozhodnutí CD-006 nepožadují.

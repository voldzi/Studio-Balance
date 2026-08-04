---
title: "Studio Balance – kompletní zadání pro vývoj webu, rezervačního systému a mobilní aplikace"
version: "1.0"
status: "Závazné funkční a UX/UI zadání pro vývoj"
language: "cs-CZ"
timezone: "Europe/Prague"
---

# Studio Balance

## Kompletní zadání pro vývoj webových stránek, rezervačního systému, mobilní aplikace a administrace

> Tento dokument je hlavním zadáním pro vývoj projektu Studio Balance.  
> V případě rozporu se staršími návrhy platí požadavky uvedené v tomto dokumentu.

---

# 1. Účel dokumentu

Cílem dokumentu je předat vývojáři jednoznačné zadání pro vytvoření jednotného digitálního prostředí Studio Balance, které bude zahrnovat:

1. prezentační webové stránky;
2. vlastní rezervační systém;
3. mobilní aplikaci pro klienty;
4. administrační rozhraní pro provozovatelku studia;
5. společný backend, databázi a systém oznámení.

Web, rezervační systém i mobilní aplikace musí působit jako jeden produkt. Nesmí vzniknout tři vizuálně ani funkčně odlišná řešení. Klient má mít při používání webu i aplikace stejný pocit jako při návštěvě samotného studia: klid, elegance, přírodní prostředí, profesionalita a jednoduchost.

Dokument obsahuje funkční požadavky, pravidla rezervací, návrh jednotlivých obrazovek, požadavky na administraci, datový model, doporučenou technickou architekturu, texty systémových zpráv, akceptační kritéria a výslovné vymezení toho, co se vyvíjet nemá.

---

# 2. Závazná rozhodnutí a omezení rozsahu

Tato kapitola shrnuje rozhodnutí, která jsou pro vývoj závazná.

## 2.1 Co systém musí obsahovat

- elegantní responzivní web Studio Balance;
- přehled všech lekcí a jejich detailní popisy;
- týdenní rozvrh s možností otevřít detail konkrétní lekce;
- rezervaci na konkrétní termín lekce;
- přihlášení a jednoduchou registraci klienta;
- přehled budoucích a minulých rezervací klienta;
- možnost včasného i pozdního storna;
- automatické vyhodnocení storno podmínky 24 hodin;
- upozornění před lekcí;
- mobilní aplikaci pro iOS a Android;
- administraci pro správu rozvrhu, lekcí, instruktorů, klientů a rezervací;
- reálné fotografie studia, lekcí, osob a skutečně používaných pomůcek;
- recenze, galerii, kontakt, mapu a odkazy na sociální sítě;
- jednotný vzhled webu, rezervací, aplikace a administrace.

## 2.2 Co systém nesmí obsahovat

### Online platby

Systém nebude přijímat žádné online platby. Nesmí obsahovat:

- platební bránu;
- Apple Pay;
- Google Pay;
- online platbu kartou;
- ukládání platebních karet;
- automatické strhávání storno poplatků;
- online fakturační checkout;
- nákup lekce přes web nebo aplikaci.

Klient si pouze rezervuje místo. Za lekci zaplatí až po příchodu do studia:

- hotově;
- nebo platební kartou přes fyzický platební terminál ve studiu.

Na webu i v aplikaci musí být tato informace jasně uvedena, ale klient nesmí být veden do žádného online platebního kroku.

### Online permanentky

V klientském webu, rezervačním systému ani mobilní aplikaci nebudou:

- online permanentky;
- nákup permanentek;
- přehled zakoupených permanentek;
- zůstatek vstupů;
- QR permanentky;
- automatické odečítání vstupů;
- expirace permanentek;
- online prodlužování permanentek.

Provozovatelka může používat fyzické nebo ručně vedené permanentky a přijímat za ně platbu ve studiu. To není součástí tohoto softwaru. Na veřejném ceníku může být podle rozhodnutí provozovatelky uvedena pouze statická informace o možnosti zakoupit permanentku přímo ve studiu, ale bez nákupního tlačítka a bez evidence v účtu klienta.

### Počet volných míst

Klientská část nebude zobrazovat číselný počet volných míst, například „3 místa zbývají“. Kapacita lekce však musí být interně nastavena, aby nedošlo k přeplnění.

Klient uvidí pouze jeden z jednoduchých stavů:

- **Lze rezervovat**;
- **Lekce je obsazena**;
- **Rezervace uzavřena**;
- **Lekce zrušena**.

### Seznam náhradníků

Systém nebude obsahovat čekací listinu ani seznam náhradníků. U obsazené lekce nebude možné přihlásit se jako náhradník a systém nebude rozesílat upozornění na uvolněné místo.

## 2.3 Storno pravidlo

Závazné znění storno podmínky:

> Rezervaci lze bezplatně zrušit nejpozději 24 hodin před začátkem lekce. Při zrušení méně než 24 hodin před lekcí nebo při neúčasti bude účtován storno poplatek ve výši ceny rezervované lekce.

Systém musí hranici 24 hodin vypočítat automaticky podle času začátku lekce v časovém pásmu Europe/Prague.

- Storno provedené přesně 24 hodin před začátkem je bezplatné.
- Storno provedené méně než 24 hodin před začátkem je pozdní storno.
- Nedostavení se bez storna je neúčast.
- Pozdní storno i neúčast zakládají storno poplatek ve výši ceny lekce.
- Storno poplatek se nehradí online. Je evidován administrativně a řeší se přímo ve studiu.
- Administrátor musí mít možnost storno poplatek označit jako vyřešený nebo prominutý.
- Při zrušení lekce ze strany studia se storno poplatek nikdy neuplatní.

---

# 3. Vize produktu a základní principy

Studio Balance nemá působit jako běžné fitness centrum ani jako technický rezervační portál. Má působit jako elegantní boutique studio zaměřené na kvalitní pohyb, rovnováhu, sílu, klid a příjemnou atmosféru.

## 3.1 Hlavní cíle

1. Návštěvník během několika sekund pochopí, co Studio Balance nabízí.
2. Klient snadno najde vhodnou lekci.
3. Klient si zobrazí rozvrh bez registrace.
4. Po kliknutí na lekci získá všechny důležité informace.
5. Rezervace zabere co nejméně kroků.
6. Klient vždy ví:
   - jakou lekci si rezervoval;
   - kdy lekce začíná a končí;
   - kdo ji vede;
   - kde se koná;
   - kdy má přijít;
   - co si má vzít;
   - pro koho je lekce určena;
   - jaké jsou storno podmínky;
   - že platí až ve studiu.
7. Provozovatelka upraví rozvrh a obsah bez zásahu programátora.
8. Web a aplikace používají jeden společný účet a jednu databázi rezervací.
9. Všechny obrazovky jsou jednoduché, čitelné a nepřeplácané.
10. Vizuál odpovídá skutečnému interiéru, logu a tiskovinám Studio Balance.

## 3.2 Produktové principy

### Méně je více

Na jedné obrazovce nemá být příliš mnoho textu, tlačítek ani barev. Hlavní akce musí být vždy zřejmá.

### Fotografie prodávají atmosféru

Web musí používat velké kvalitní fotografie. Fotografie mají ukazovat reálné prostředí, světlo, pohyb, emoci a skutečné pomůcky.

### Rezervace bez zbytečných překážek

Rozvrh je veřejný. Registrace se vyžaduje až při samotném dokončení rezervace.

### Jedna značka

Rezervace se nesmí otevřít v cizím vzhledu nebo působit jako nepropojená externí služba. I když bude rezervační systém samostatná technická část, musí být vizuálně součástí Studio Balance.

### Mobil na prvním místě

Většina běžných klientských úkonů musí být pohodlná na telefonu. Web musí fungovat výborně i bez instalace aplikace.

### Jasná pravidla

Storno podmínka, čas příchodu a způsob platby musí být komunikovány před potvrzením rezervace a také v potvrzovacích zprávách.

---

# 4. Vizuální identita a design systém

## 4.1 Oficiální logo

Používat výhradně poslední schválené logo Studio Balance dodané provozovatelkou.

Vývojář nesmí:

- překreslovat logo jiným fontem;
- měnit proporce;
- natahovat logo;
- měnit jeho symbol;
- nahrazovat logo předchozí verzí;
- používat generované napodobeniny;
- přidávat efekty, které nejsou součástí identity.

Logo musí být použito:

- v hlavní navigaci webu;
- v zápatí webu;
- na přihlašovací obrazovce;
- v rezervační části;
- na úvodní obrazovce aplikace;
- jako ikona aplikace v upravené zjednodušené variantě;
- v administračním rozhraní;
- v e-mailových potvrzeních;
- na systémových šablonách;
- na faviconě;
- na obrazovce načítání aplikace.

Pro produkci je nutné vyžádat logo minimálně ve formátu SVG a PNG s transparentním pozadím.

## 4.2 Barevná atmosféra

Barevnost musí vycházet z interiéru, vizitek a loga:

- krémová;
- teplá bílá;
- písková;
- béžová;
- cappuccino;
- přírodní hnědá;
- měděná nebo rose gold jako jemný akcent;
- tmavě hnědá pro hlavní text.

Čistou černou používat jen výjimečně. Preferovaný je tmavě hnědý text.

### Doporučené výchozí design tokeny

Konečné odstíny se mají před vývojem ověřit proti originálním grafickým podkladům.

| Token | Doporučená hodnota | Použití |
|---|---:|---|
| `--color-bg-primary` | `#F7F3EE` | hlavní krémové pozadí |
| `--color-bg-secondary` | `#E8DDD0` | pískové bloky a karty |
| `--color-bg-light` | `#FFFDF9` | velmi světlé plochy |
| `--color-text-primary` | `#3E332D` | hlavní text |
| `--color-text-secondary` | `#6B584A` | sekundární text |
| `--color-accent` | `#B56E4F` | měděný akcent |
| `--color-border` | `#DCCDBD` | jemné linky a okraje |
| `--color-success` | tlumený přírodní odstín | potvrzení |
| `--color-error` | tlumený cihlový odstín | chyby a pozdní storno |

Barvy pro úspěch, upozornění a chybu nesmí působit křiklavě, ale musí být dostatečně kontrastní.

## 4.3 Typografie

Použít kombinaci:

- elegantního patkového písma pro hlavní nadpisy;
- jednoduchého bezpatkového písma pro běžný text, formuláře, časy a tlačítka.

Vhodný vizuální směr:

- nadpisy: elegantní serif, jemný a nadčasový;
- běžný text: čistý sans-serif s výbornou čitelností;
- nepoužívat tvrdé „sportovní“, futuristické ani techno fonty.

Text musí být dobře čitelný na mobilu. Základní velikost běžného textu nesmí být příliš malá.

## 4.4 Grafické prvky

Použít:

- dostatek prázdného prostoru;
- jemné linky;
- měkké zaoblení;
- lehké stíny;
- nenápadné přechody;
- přirozené textury inspirované omítkou, papírem nebo dřevem;
- jemný botanický motiv pouze jako doplněk;
- decentní animace při načtení a posunu stránky.

Nepoužívat:

- neonové barvy;
- blikající bannery;
- výrazné gradienty;
- příliš mnoho ikon;
- přehnané animace;
- přeplněné tabulky;
- tvrdé černé rámečky;
- typický vzhled levného fitness portálu.

## 4.5 Fotografie a video

Produkční web musí používat skutečné fotografie dodané provozovatelkou nebo profesionálně nafocené ve studiu.

### Úvodní fotografie

Na domovské stránce použít schválenou fotografii reálného studia s:

- velkým osvětleným zrcadlem;
- teplým LED osvětlením;
- barre tyčí;
- přírodními materiály;
- světlým a klidným interiérem;
- správným oficiálním logem Studio Balance nad zrcadlem nebo v odpovídající části kompozice.

Nesmí být použita starší úvodní fotografie ani verze s chybným logem.

### Fotografie lekcí

Fotografie lekcí musí ukazovat realistické osoby a pomůcky, které se skutečně používají:

- Barre – osoba u skutečné barre tyče;
- TRX – osoba cvičící s originálním závěsným systémem;
- Balance Flow – osoba používající skutečný Balance Flow Board;
- Jumping – osoba na skutečné jumping trampolíně;
- Kruhový trénink – skutečné činky, kettlebell, medicinbal, TRX a další reálné vybavení;
- Power jóga – podložka, jógový blok a další skutečně používané pomůcky.

Fotografie nesmí obsahovat nesmyslné, deformované nebo smyšlené pomůcky. Na finálním webu nemají být použity generické AI obrázky s nepřesným vybavením.

### Technické zpracování fotografií

- zachovat poměr stran bez deformace;
- připravit desktopovou i mobilní variantu ořezu;
- používat moderní kompresi;
- načítat obrázky postupně;
- doplnit smysluplný alternativní text;
- nepřekrývat důležitou část fotografie textem;
- text na hero fotografii musí mít dostatečný kontrast.

---

# 5. Tón komunikace a textový styl

Komunikace má být:

- klidná;
- přátelská;
- profesionální;
- lidská;
- podporující;
- bez nátlaku;
- bez agresivních fitness sloganů;
- bez slibů rychlého hubnutí nebo nereálných výsledků.

Hlavní slogan:

# Najdi si svůj balans.

Volitelný doplňkový motiv:

**MOVE • FLOW • BALANCE**

Slogan může být osobní, ale běžná provozní komunikace má používat zdvořilé oslovení klienta.

Příklady vhodné komunikace:

- „Vyberte si lekci, která vám bude vyhovovat.“
- „Přijďte prosím 10 minut před začátkem.“
- „Těšíme se na vás ve Studio Balance.“
- „Rezervace byla potvrzena.“
- „Platba probíhá až ve studiu.“

Nepoužívat:

- „Musíte“ bez skutečné potřeby;
- přehnané vykřičníky;
- nátlakové odpočítávání;
- agresivní „Kup teď“;
- falešnou naléhavost.

---

# 6. Cílové skupiny

## 6.1 Nová návštěvnice nebo návštěvník

Potřebuje rychle zjistit:

- co studio nabízí;
- jak studio vypadá;
- jaké jsou lekce;
- zda je lekce vhodná pro začátečníka;
- co si vzít;
- kolik lekce stojí;
- kde studio najde;
- jak rezervace funguje.

## 6.2 Pravidelný klient

Potřebuje:

- rychle otevřít rozvrh;
- zopakovat rezervaci;
- vidět nejbližší rezervaci;
- zrušit rezervaci;
- dostat upozornění;
- zkontrolovat čas a doporučený příchod;
- otevřít navigaci do studia.

## 6.3 Provozovatelka studia

Potřebuje bez programátora:

- upravovat rozvrh;
- přidávat a rušit termíny;
- spravovat instruktory;
- upravovat popisy a fotografie lekcí;
- vidět rezervace;
- evidovat docházku;
- označit pozdní storno a neúčast;
- poslat klientům informaci o změně;
- spravovat obsah webu;
- přidávat novinky a fotografie.

## 6.4 Instruktor

V první verzi nemusí mít samostatnou aplikaci. Administrátor u každé lekce eviduje instruktora. Přihlášení instruktora lze připravit jako budoucí rozšíření.

---

# 7. Informační architektura celého řešení

Řešení se skládá ze čtyř uživatelských částí:

1. **Veřejný web**  
   Prezentuje studio, lekce, rozvrh, ceník, galerii, recenze a kontakt.

2. **Klientská rezervační část**  
   Umožňuje registraci, přihlášení, rezervaci, storno a zobrazení rezervací.

3. **Mobilní aplikace**  
   Nabízí stejné rezervace jako web a navíc pohodlná upozornění a rychlý přístup k nejbližší lekci.

4. **Administrace**  
   Slouží provozovatelce ke správě obsahu a provozu.

Všechny části používají:

- jednu databázi klientů;
- jednu databázi rozvrhu;
- jednu databázi rezervací;
- jednu sadu pravidel;
- jednu sadu fotografií a popisů;
- jeden systém oznámení;
- jeden zdroj pravdy.

Rezervace vytvořená na webu se musí okamžitě zobrazit v mobilní aplikaci a administraci. Rezervace zrušená v aplikaci se musí okamžitě projevit na webu a v administraci.

---

# 8. Webové stránky – celková struktura

Doporučené hlavní menu:

- Domů
- O studiu
- Lekce
- Rozvrh
- Balance Flow
- Galerie
- Recenze
- Ceník
- Kontakt
- Rezervovat lekci

Na mobilu použít přehledné rozbalovací menu a dobře viditelné tlačítko „Rezervovat lekci“.

Doporučené URL:

```text
/
 /o-studiu
 /lekce
 /lekce/barre
 /lekce/trx
 /lekce/balance-flow
 /lekce/jumping
 /lekce/kruhovy-trenink
 /lekce/power-joga
 /rozvrh
 /balance-flow
 /galerie
 /recenze
 /cenik
 /kontakt
 /faq
 /rezervace
 /prihlaseni
 /registrace
 /muj-ucet
 /obchodni-podminky
 /ochrana-osobnich-udaju
 /cookies
```

---

# 9. Web – domovská stránka

## 9.1 Účel

Domovská stránka má během prvních sekund vytvořit elegantní dojem, představit značku a dovést návštěvníka k rozvrhu nebo rezervaci.

## 9.2 Hero sekce

Hero zabere na desktopu přibližně výšku obrazovky. Na mobilu musí být ořez fotografie přizpůsoben tak, aby zůstalo viditelné zrcadlo, světlo a atmosféra studia.

Obsah:

- oficiální logo;
- slogan „Najdi si svůj balans.“;
- volitelný podtext „Pohyb. Síla. Klid. Rovnováha.“;
- hlavní tlačítko „Rezervovat lekci“;
- vedlejší tlačítko „Prohlédnout rozvrh“.

Tlačítko „Rezervovat lekci“ otevře aktuální rozvrh. Tlačítko „Prohlédnout rozvrh“ vede na stejnou stránku, případně na konkrétní část rozvrhu. Hlavní CTA má být vizuálně výraznější.

Fotografie musí být schválená fotografie se zrcadlem a správným logem. Text nesmí překrývat dominantní prvky fotografie.

## 9.3 Krátké představení

Následuje krátká sekce s nadpisem například:

**Pohyb, který dává smysl.**

Text má být stručný, přibližně 2 až 4 věty. Má vysvětlit, že Studio Balance je příjemné boutique studio pro začátečníky i pokročilé, s menšími skupinami a osobním přístupem.

## 9.4 Přehled lekcí

Sekce „Vyberte si svůj pohyb“ zobrazí jednotlivé typy lekcí jako velké karty.

Každá karta obsahuje:

- reálnou fotografii osoby s odpovídající pomůckou;
- název lekce;
- krátkou větu;
- jemné tematické štítky;
- odkaz „Zjistit více“.

Karty nesmí působit jako katalog produktů. Mají být vzdušné a vizuální.

## 9.5 Náhled nejbližšího rozvrhu

Na domovské stránce zobrazit několik nejbližších termínů. Není nutné ukazovat celý týden.

Každý termín obsahuje:

- den a datum;
- čas;
- název lekce;
- instruktora;
- stav „Lze rezervovat“, „Obsazeno“, „Zrušeno“;
- tlačítko nebo klikací kartu.

Nezobrazovat číselný počet volných míst.

## 9.6 O studiu

Krátká vizuální sekce s fotografií interiéru a několika větami o atmosféře, přístupu a vybavení.

Možné čtyři hodnoty:

- příjemné prostředí;
- menší skupiny;
- kvalitní pomůcky;
- pohyb pro začátečníky i pokročilé.

## 9.7 Balance Flow

Samostatná výrazná sekce představí autorský nebo charakteristický koncept Balance Flow.

Obsah:

- fotografie s reálným Balance Flow Boardem;
- krátké vysvětlení;
- hlavní přínosy;
- tlačítko „Zjistit více“;
- tlačítko „Najít termín“.

## 9.8 Galerie

Použít několik velkých fotografií, nikoli mnoho malých náhledů. Galerie má ukazovat:

- studio;
- lekce;
- instruktory;
- pomůcky;
- světlo a interiér;
- atmosféru;
- akce.

## 9.9 Recenze

Zobrazit 3 až 6 ručně schválených recenzí v elegantním posuvníku nebo kartách.

Každá recenze:

- křestní jméno nebo iniciála;
- text;
- volitelně zdroj recenze;
- hvězdičky pouze tehdy, pokud jsou skutečné.

Automatické načítání z Google nebo Facebooku není podmínkou první verze. Administrace musí umožnit recenze ručně vložit, skrýt a seřadit.

## 9.10 Kontakt a závěrečná výzva

Před zápatím zobrazit:

- krátkou výzvu k první rezervaci;
- adresu;
- telefon;
- e-mail;
- parkování;
- otevírací informace;
- odkaz na mapu;
- Instagram;
- Facebook;
- případně TikTok, pokud jej studio používá.

## 9.11 Zápatí

Zápatí obsahuje:

- logo;
- krátký slogan;
- kontakt;
- sociální sítě;
- rychlé odkazy;
- obchodní podmínky;
- storno podmínky;
- ochranu osobních údajů;
- cookies;
- copyright.

---

# 10. Web – stránka O studiu

Stránka musí působit osobně, ale nemá obsahovat příliš dlouhý souvislý text.

Doporučené bloky:

1. příběh vzniku studia;
2. filozofie;
3. fotografie interiéru;
4. informace o menších skupinách a přístupu;
5. vybavení;
6. představení instruktorek nebo instruktorů;
7. praktické informace;
8. závěrečné CTA k rozvrhu.

Praktické informace:

- kde se studio nachází;
- jak se do něj dostat;
- kde parkovat;
- kdy přijít;
- co si vzít;
- jak probíhá první návštěva;
- že se platí až ve studiu;
- že rezervace je závazná;
- základní storno pravidlo.

---

# 11. Web – přehled lekcí

## 11.1 Počáteční seznam lekcí

Systém nesmí mít názvy lekcí napevno v kódu. Administrace musí umožnit typy lekcí přidávat, skrývat a měnit.

Počáteční sada zahrnuje minimálně:

- Barre;
- TRX;
- Balance Flow;
- Jumping;
- Kruhový trénink;
- Power jóga.

Pokud provozovatelka později používá názvy jako Barre Sculpt, Barre Strength nebo Slow Burn Barre, musí být možné vytvořit je jako samostatný typ lekce bez úpravy programu.

## 11.2 Karta lekce

Karta lekce obsahuje:

- hlavní fotografii;
- název;
- jednu krátkou charakteristiku;
- 2 až 4 štítky, například „síla“, „mobilita“, „kondice“, „rovnováha“;
- tlačítko „Detail lekce“;
- volitelně tlačítko „Najít termín“.

## 11.3 Filtrování

Na veřejné stránce lze nabídnout jednoduché filtrování podle cíle:

- zpevnění;
- síla;
- kondice;
- mobilita;
- rovnováha;
- uvolnění.

Filtry jsou volitelné. Nesmí zkomplikovat základní přehled.

---

# 12. Web a aplikace – detail typu lekce

Každý typ lekce má vlastní obsahovou stránku.

## 12.1 Povinné položky

- název lekce;
- hlavní reálná fotografie;
- krátký úvodní popis;
- podrobnější popis;
- co lekce obsahuje;
- hlavní přínosy;
- pro koho je určena;
- zda je vhodná pro začátečníky;
- orientační náročnost;
- obvyklá délka;
- používané pomůcky;
- co si vzít s sebou;
- doporučený příchod;
- případná praktická upozornění;
- nejbližší termíny;
- CTA „Rezervovat lekci“.

## 12.2 Doporučená struktura

```text
[Velká fotografie]

NÁZEV LEKCE
Krátká charakteristika

[Štítky zaměření]

O lekci
Co vás čeká
Pro koho je lekce určena
Pomůcky
Co si vzít
Délka a náročnost

[Nejbližší termíny]
[Rezervovat lekci]
```

## 12.3 Obsah jednotlivých lekcí

Přesné marketingové texty dodá nebo schválí provozovatelka. Systém musí podporovat níže uvedenou strukturu.

### Barre

Fotografie musí ukazovat skutečnou barre tyč a realistický pohyb. Detail může popisovat spojení prvků baletu, pilates a funkčního posilování. Pomůcky mohou zahrnovat barre tyč, lehké činky, overball nebo odporovou gumu podle skutečné náplně.

### TRX

Fotografie musí ukazovat správně zavěšený TRX systém a bezpečné použití. Detail zdůrazní práci s vlastní vahou, stabilitu, sílu a střed těla.

### Balance Flow

Fotografie musí ukazovat skutečný Balance Flow Board. Text vysvětlí plynulý pohyb, stabilitu, koordinaci, mobilitu, rovnováhu a práci se středem těla. Tato lekce může být na webu vizuálně zvýrazněna jako charakteristický koncept Studio Balance.

### Jumping

Fotografie musí ukazovat skutečnou jumping trampolínu. Text vysvětlí kondiční charakter, rytmus, koordinaci a dynamický pohyb. Nesmí obsahovat nesprávnou nebo běžnou dětskou trampolínu.

### Kruhový trénink

Fotografie musí realisticky ukazovat stanoviště a pomůcky, například činky, kettlebell, medicinbal, TRX, podložku nebo další skutečně používané vybavení.

### Power jóga

Fotografie musí ukazovat podložku a případné jógové bloky. Text představí sílu, mobilitu, stabilitu, dech a plynulost.

## 12.4 Zdravotní a bezpečnostní informace

Vývojář nemá vytvářet medicínská tvrzení. Administrace musí umožnit provozovatelce vložit ke konkrétní lekci vlastní upozornění nebo doporučení.

---

# 13. Web – rozvrh

Rozvrh je jedna z nejdůležitějších částí celého produktu.

## 13.1 Desktopové zobrazení

Na desktopu zobrazit přehledný týden:

- navigace na předchozí a další týden;
- tlačítko „Tento týden“;
- sloupce nebo přehled po dnech;
- datum;
- karty jednotlivých termínů;
- čas začátku a konce;
- název;
- instruktor;
- stav;
- možnost kliknout na celou kartu.

Rozvrh nesmí být těžko čitelná excelová tabulka. Karty musí mít dostatek prostoru.

## 13.2 Mobilní zobrazení

Na mobilu zobrazit:

- horizontální výběr dne;
- datum;
- svislý seznam termínů;
- čas;
- název;
- instruktor;
- stav;
- velkou klikací plochu.

Na mobilu nezobrazovat stísněnou sedmidenní tabulku.

## 13.3 Informace přímo v rozvrhu

Přímo na kartě termínu uvést pouze nejdůležitější údaje:

- čas;
- název;
- instruktor;
- případně délku;
- stav rezervace.

Podrobný popis, fotografie a pomůcky se otevřou až po kliknutí.

## 13.4 Stavy termínu

- **Lze rezervovat** – rezervace je otevřená a interní kapacita není naplněna.
- **Obsazeno** – interní kapacita je naplněna; bez čekací listiny.
- **Rezervace uzavřena** – rezervace byla uzavřena administrátorem nebo podle času.
- **Zrušeno** – lekce byla zrušena.
- **Proběhlo** – historický termín.

Číselný počet míst se klientovi nezobrazuje.

## 13.5 Kliknutí na termín

Po kliknutí se na desktopu otevře elegantní dialog nebo samostatná stránka. Na mobilu se otevře detail přes celou obrazovku.

Detail konkrétního termínu musí obsahovat:

- fotografii typu lekce;
- název;
- datum;
- čas začátku a konce;
- vypočtený doporučený čas příchodu;
- instruktora;
- místo konání;
- krátký popis;
- odkaz na celý detail typu lekce;
- pro koho je určena;
- náročnost;
- co si vzít;
- používané pomůcky;
- informaci o platbě ve studiu;
- storno podmínku;
- tlačítko „Rezervovat lekci“.

---

# 14. Web – Balance Flow

Balance Flow má mít samostatnou výraznou stránku.

Obsah:

- hlavní fotografie s reálným Balance Flow Boardem;
- vysvětlení konceptu;
- příběh nebo filozofie;
- hlavní prvky metody;
- komu je určena;
- co rozvíjí;
- fotografie a případně krátké video;
- nejbližší termíny;
- CTA k rezervaci.

Budoucí školení, kurzy nebo certifikace mohou být přidány později. V první verzi není nutné vytvářet e-learning ani online prodej školení.

---

# 15. Web – galerie

Galerie musí být snadno spravovatelná.

Kategorie:

- Studio;
- Lekce;
- Akce;
- Atmosféra;
- Pomůcky.

Požadavky:

- otevření fotografie ve větším náhledu;
- ovládání klávesnicí;
- zavření křížkem i klávesou Escape;
- optimalizace obrázků;
- alternativní text;
- možnost měnit pořadí;
- možnost skrýt fotografii bez smazání;
- nepoužívat automatické přehrávání hlučných videí.

---

# 16. Web – recenze

Recenze jsou důležitou součástí důvěryhodnosti.

Požadavky:

- ruční správa recenzí v administraci;
- jméno nebo iniciála;
- text;
- zdroj;
- datum volitelně;
- fotografie klienta pouze se souhlasem;
- možnost recenzi aktivovat a deaktivovat;
- možnost určit pořadí;
- CTA k rezervaci.

Automatické napojení na externí recenze je rozšíření, nikoli podmínka první verze.

---

# 17. Web – ceník

Ceník bude informační, bez online nákupu.

Každá položka může obsahovat:

- název;
- cenu;
- krátké vysvětlení;
- platnost ceny;
- poznámku.

Nad nebo pod ceníkem uvést:

> Platba za lekci probíhá až ve studiu, a to hotově nebo kartou prostřednictvím platebního terminálu.

Pokud bude uvedena fyzická permanentka, musí jít pouze o statickou informaci. Nesmí mít tlačítko „Koupit“, přidání do košíku ani propojení s klientským účtem.

---

# 18. Web – kontakt a FAQ

## 18.1 Kontakt

- adresa;
- telefon;
- e-mail;
- mapa;
- navigovat;
- parkování;
- otevírací informace;
- Instagram;
- Facebook;
- případně TikTok;
- kontaktní formulář volitelně.

Kontaktní formulář musí mít ochranu proti spamu a jasný souhlas se zpracováním údajů.

## 18.2 FAQ

Doporučené otázky:

- Je lekce vhodná pro začátečníky?
- Co si mám vzít s sebou?
- Kdy mám přijít?
- Kde mohu zaparkovat?
- Jak se rezervuji?
- Jak rezervaci zruším?
- Jaké jsou storno podmínky?
- Jak zaplatím?
- Mohu přijít bez rezervace?
- Co se stane, když je lekce obsazena?
- Potřebuji vlastní pomůcky?
- Jak zjistím změnu nebo zrušení lekce?

---

# 19. Rezervační systém – základní princip

Rezervační systém musí být vlastní součástí značky Studio Balance a musí být použitelný:

- na webu;
- v mobilní aplikaci;
- v administraci.

Stejná rezervace nesmí vznikat odděleně ve více systémech.

Základní tok:

```text
Rozvrh
→ výběr termínu
→ detail termínu
→ přihlášení nebo rychlá registrace
→ potvrzení pravidel
→ rezervace
→ potvrzení
→ připomenutí
→ účast nebo storno
```

Rezervace nesmí obsahovat platební krok.

---

# 20. Registrace a přihlášení

## 20.1 Prohlížení bez účtu

Bez účtu musí být dostupné:

- domovská stránka;
- přehled lekcí;
- detail lekcí;
- rozvrh;
- ceník;
- galerie;
- recenze;
- kontakt.

## 20.2 Účet vyžadovaný pro rezervaci

Pro vytvoření rezervace je nutný klientský účet. Minimální údaje:

- jméno;
- příjmení;
- e-mail;
- telefon;
- heslo nebo jiný bezpečný způsob přihlášení;
- souhlas s podmínkami;
- potvrzení seznámení se storno podmínkou;
- souhlas s ochranou osobních údajů v rozsahu potřebném pro službu.

Datum narození a nouzový kontakt nejsou povinné a v první verzi se nemají vyžadovat.

## 20.3 Přihlášení

Povinné funkce:

- přihlášení e-mailem;
- odhlášení;
- zapomenuté heslo;
- změna hesla;
- ověření e-mailu;
- bezpečné udržení relace.

Přihlášení přes Google, Apple nebo Facebook není povinnou součástí první verze. Lze je doplnit později, pokud nebude narušena jednoduchost.

## 20.4 Rychlá registrace během rezervace

Klient se nesmí nejprve ztratit v samostatném dlouhém procesu. Při rezervaci lze otevřít jednoduchý formulář a po jeho dokončení pokračovat na potvrzení vybrané lekce.

---

# 21. Rezervace termínu – podrobný tok

## 21.1 Krok 1: Výběr

Klient vybere termín v rozvrhu.

## 21.2 Krok 2: Detail

Zobrazí se všechny podstatné informace včetně fotografie, obsahu lekce, času, instruktora, příchodu, pomůcek a storno podmínek.

## 21.3 Krok 3: Přihlášení

Nepřihlášený klient se přihlásí nebo zaregistruje. Po úspěchu se musí vrátit přímo k vybranému termínu, nikoli na domovskou stránku.

## 21.4 Krok 4: Potvrzení

Před konečným potvrzením zobrazit:

- název;
- datum;
- čas;
- instruktor;
- doporučený příchod;
- místo;
- cenu;
- „Platba až ve studiu“;
- storno pravidlo;
- potvrzovací tlačítko.

Doporučený text zaškrtávacího pole:

> Beru na vědomí, že rezervaci lze bezplatně zrušit nejpozději 24 hodin před začátkem. Při pozdějším zrušení nebo neúčasti vzniká storno poplatek ve výši ceny lekce.

Zaškrtnutí je povinné při první rezervaci a při změně znění podmínek. U dalších rezervací může být podmínka viditelná bez opakovaného zaškrtnutí, pokud provozovatelka schválí tento postup.

## 21.5 Krok 5: Uložení

Backend musí:

1. znovu ověřit, zda je rezervace otevřená;
2. ověřit interní kapacitu;
3. zabránit duplicitní rezervaci stejného klienta na stejný termín;
4. uložit rezervaci atomicky;
5. vrátit potvrzení;
6. naplánovat oznámení.

Dvojité kliknutí nesmí vytvořit dvě rezervace.

## 21.6 Krok 6: Potvrzení

Potvrzovací obrazovka:

```text
Rezervace potvrzena

Balance Flow
Čtvrtek 17:00–18:00
Studio Balance
Doporučený příchod: 16:50

Platba proběhne až ve studiu.
Těšíme se na vás.
```

Akce:

- „Přidat do kalendáře“;
- „Zobrazit moje rezervace“;
- „Navigovat“;
- „Zpět na rozvrh“.

Funkce „Přidat do kalendáře“ je doporučená, protože nevyžaduje online platbu a pomáhá klientovi nezapomenout.

---

# 22. Kapacita a obsazená lekce

Kapacita je nastavena administrátorem pro každý termín nebo převzata z typu lekce.

Pravidla:

- systém nesmí přijmout více aktivních rezervací, než je kapacita;
- kontrola musí být bezpečná i při současném kliknutí více klientů;
- klient nevidí počet volných míst;
- při naplnění se zobrazí „Lekce je obsazena“;
- tlačítko rezervace je deaktivováno;
- není nabídnuta čekací listina;
- po včasném stornu se termín opět stane rezervovatelný, ale bez automatického obesílání náhradníků.

---

# 23. Moje rezervace

Klientský účet obsahuje dvě základní části:

## 23.1 Nadcházející rezervace

Každá karta:

- název;
- datum;
- čas;
- doporučený příchod;
- instruktor;
- místo;
- stav;
- tlačítko „Detail“;
- tlačítko „Zrušit rezervaci“, pokud je to možné.

## 23.2 Historie

Historie může obsahovat:

- absolvované lekce;
- včas zrušené rezervace;
- pozdní storna;
- neúčasti;
- lekce zrušené studiem.

Historie nesmí obsahovat permanentky ani online platby.

## 23.3 Nejbližší rezervace

Na domovské obrazovce účtu i aplikace zvýraznit nejbližší rezervaci.

---

# 24. Zrušení rezervace

## 24.1 Včasné storno

Pokud do začátku zbývá alespoň 24 hodin:

- systém označí rezervaci jako včas zrušenou;
- nevznikne storno poplatek;
- klient dostane potvrzení;
- kapacita se uvolní.

Text:

> Rezervace byla zrušena bez storno poplatku.

## 24.2 Pozdní storno

Pokud do začátku zbývá méně než 24 hodin:

- před zrušením zobrazit výrazné upozornění;
- klient musí potvrdit, že rozumí storno poplatku;
- rezervace se označí jako pozdně zrušená;
- vznikne interní záznam storno poplatku ve výši ceny lekce;
- neproběhne online platba;
- klient dostane potvrzení.

Doporučený dialog:

> Do začátku lekce zbývá méně než 24 hodin. Při zrušení bude účtován storno poplatek ve výši ceny lekce. Poplatek se řeší přímo ve studiu. Opravdu chcete rezervaci zrušit?

Tlačítka:

- „Ponechat rezervaci“;
- „Zrušit se storno poplatkem“.

## 24.3 Neúčast

Administrátor může po lekci označit rezervaci jako „Nedostavil/a se“. Systém vytvoří storno poplatek ve výši ceny lekce.

## 24.4 Výjimka administrátora

Administrátor může:

- storno poplatek prominout;
- uvést důvod;
- označit jej jako vyřešený;
- opravit omylem nastavený stav.

Všechny změny se mají zaznamenat do auditního logu.

---

# 25. Zrušení nebo změna lekce studiem

## 25.1 Zrušení

Administrátor může zrušit termín. Systém musí:

- zabránit novým rezervacím;
- označit termín jako zrušený;
- zrušit aktivní rezervace stavem „Zrušeno studiem“;
- nevytvářet storno poplatky;
- odeslat e-mail;
- odeslat push notifikaci uživatelům aplikace;
- zobrazit změnu v účtu.

## 25.2 Změna času, instruktora nebo místa

Při významné změně systém:

- uloží původní a novou hodnotu;
- identifikuje dotčené klienty;
- odešle oznámení;
- zvýrazní změnu v detailu rezervace.

U změny času musí být klientovi umožněno rezervaci zrušit podle provozního rozhodnutí. Administrace má mít možnost výjimečně povolit bezplatné storno bez ohledu na 24hodinovou hranici.

---

# 26. Doporučený čas příchodu

Výchozí doporučení je přijít 10 minut před začátkem.

Systém musí z času lekce automaticky vypočítat a zobrazit například:

- začátek lekce: 17:00;
- doporučený příchod: 16:50.

Hodnota 10 minut má být nastavitelná:

- globálně pro studio;
- volitelně pro konkrétní typ lekce;
- volitelně pro konkrétní termín.

Doporučený příchod se zobrazí:

- v detailu lekce;
- v potvrzení rezervace;
- v e-mailu;
- v aplikaci;
- v push notifikaci;
- v přidané události kalendáře.

---

# 27. Oznámení

## 27.1 Kanály

Povinné:

- e-mail;
- push notifikace v mobilní aplikaci;
- oznámení uvnitř aplikace.

SMS nejsou součástí první verze.

## 27.2 Provozní a marketingová oznámení

Provozní oznámení:

- potvrzení rezervace;
- připomenutí;
- změna;
- zrušení;
- potvrzení storna.

Marketingová oznámení:

- novinky;
- workshopy;
- speciální akce.

Marketingová oznámení musí mít samostatné nastavení a nesmí být podmínkou rezervace.

## 27.3 Výchozí připomenutí

- 24 hodin před začátkem;
- 2 hodiny před začátkem;
- 30 minut před začátkem.

Provozovatelka musí mít možnost výchozí plán upravit. Klient může v aplikaci vypnout volitelná připomenutí, ale důležité oznámení o zrušení nebo změně termínu má být odesláno vždy e-mailem.

## 27.4 Šablony zpráv

### Potvrzení

**Předmět:** Rezervace potvrzena – {{lesson_name}}

```text
Dobrý den, {{first_name}},

vaše rezervace byla potvrzena.

Lekce: {{lesson_name}}
Datum: {{date}}
Čas: {{start_time}}–{{end_time}}
Doporučený příchod: {{arrival_time}}
Instruktor: {{instructor_name}}
Místo: Studio Balance

Platba proběhne až ve studiu, hotově nebo kartou přes platební terminál.

Rezervaci lze bezplatně zrušit nejpozději 24 hodin před začátkem. Při pozdějším zrušení nebo neúčasti bude účtován storno poplatek ve výši ceny lekce.

Těšíme se na vás.
Studio Balance
```

### 24 hodin před lekcí

```text
Zítra vás čeká {{lesson_name}} v {{start_time}}.
Doporučujeme přijít v {{arrival_time}}.
Těšíme se na vás ve Studio Balance.
```

### 2 hodiny před lekcí

```text
Dnes v {{start_time}} začíná vaše lekce {{lesson_name}}.
Přijďte prosím v {{arrival_time}}.
```

### 30 minut před lekcí

```text
Už za chvíli začínáme. Vaše lekce {{lesson_name}} začíná v {{start_time}}.
Těšíme se na vás.
```

### Včasné storno

```text
Vaše rezervace na {{lesson_name}} dne {{date}} v {{start_time}} byla zrušena bez storno poplatku.
```

### Pozdní storno

```text
Vaše rezervace na {{lesson_name}} byla zrušena méně než 24 hodin před začátkem.
Vzniká storno poplatek ve výši ceny lekce, který se řeší přímo ve studiu.
```

### Zrušení studiem

```text
Omlouváme se, lekce {{lesson_name}} dne {{date}} v {{start_time}} byla zrušena.
Nevzniká vám žádný storno poplatek.
```

### Změna

```text
U vaší rezervované lekce {{lesson_name}} došlo ke změně:
{{change_summary}}

Otevřete detail rezervace a zkontrolujte aktuální informace.
```

### Po lekci

```text
Děkujeme za dnešní návštěvu Studio Balance.
Budeme rádi za krátké hodnocení.
```

---

# 28. Mobilní aplikace – cíle

Mobilní aplikace musí být dostupná pro iOS a Android. Preferované je společné cross-platform řešení, pokud zajistí kvalitní vzhled a funkčnost. Konkrétní technologii zvolí vývojář a zdůvodní ji.

Aplikace není jen obalený web bez přidané hodnoty. Musí nabídnout:

- rychlý přístup k nejbližší rezervaci;
- pohodlný rozvrh;
- rezervaci;
- storno;
- push notifikace;
- přehled změn;
- kontakt a navigaci.

Pokud bude zvolena instalační PWA místo aplikací v obchodech, musí to provozovatelka předem výslovně schválit. Výchozí očekávání je aplikace, kterou si klient stáhne do telefonu.

---

# 29. Mobilní aplikace – navigace

Doporučená spodní navigace:

1. Domů
2. Rozvrh
3. Rezervace
4. Novinky
5. Profil

Kontakt a galerie mohou být v menu nebo profilu. Hlavní navigace nesmí mít více než pět základních položek.

---

# 30. Mobilní aplikace – jednotlivé obrazovky

## 30.1 Splash screen

- krémové pozadí;
- oficiální logo;
- bez dlouhé animace;
- přechod do aplikace co nejrychleji.

## 30.2 Úvod a přihlášení

- logo;
- krátký text;
- „Přihlásit se“;
- „Vytvořit účet“;
- „Prohlédnout rozvrh bez přihlášení“.

Aplikace nesmí nutit uživatele k registraci dříve, než chce rezervovat.

## 30.3 Domů bez rezervace

```text
Dobrý den, {{first_name}}

Najděte si lekci, která vám bude vyhovovat.

[Prohlédnout rozvrh]

Nejbližší lekce
Novinky ze studia
```

## 30.4 Domů s rezervací

```text
Dobrý den, {{first_name}}

Vaše nejbližší lekce

Balance Flow
Dnes 17:00–18:00
Doporučený příchod 16:50
Instruktor: {{name}}

[Otevřít rezervaci]
[Navigovat]
```

Pod hlavní kartou mohou být:

- další rezervace;
- novinky;
- doporučené lekce.

## 30.5 Rozvrh

- přehled týdne;
- výběr dne;
- svislý seznam;
- karta termínu;
- filtr podle typu lekce nebo instruktora jako volitelné rozšíření;
- žádný počet volných míst;
- stav obsazení bez čekací listiny.

## 30.6 Detail termínu

Stejný obsah jako na webu, přizpůsobený mobilu:

- velká fotografie;
- název;
- datum;
- čas;
- příchod;
- instruktor;
- cena;
- platba ve studiu;
- popis;
- pro koho;
- co si vzít;
- storno pravidlo;
- rezervovat.

Hlavní tlačítko může být přichycené ve spodní části obrazovky.

## 30.7 Potvrzení rezervace

- výrazné potvrzení;
- shrnutí;
- přidat do kalendáře;
- navigovat;
- zobrazit rezervace.

## 30.8 Moje rezervace

Záložky:

- Nadcházející;
- Historie.

Karta musí jasně rozlišit stav.

## 30.9 Detail rezervace

- všechny údaje;
- doporučený příchod;
- stav;
- mapa;
- storno podmínka;
- zrušení;
- přidání do kalendáře;
- kontakt na studio.

## 30.10 Novinky

- jednoduché karty;
- fotografie;
- datum;
- nadpis;
- detail;
- možnost odkazu na termín nebo kontakt.

Novinky nesmí zakrývat hlavní rezervační funkce.

## 30.11 Profil

- jméno;
- e-mail;
- telefon;
- změna hesla;
- nastavení připomenutí;
- souhlas s marketingovými zprávami;
- ochrana osobních údajů;
- obchodní a storno podmínky;
- kontakt;
- odhlášení;
- žádost o zrušení účtu.

Profil neobsahuje permanentky ani online platby.

## 30.12 Oznámení v aplikaci

Otevření push notifikace musí vést přímo na související rezervaci nebo novinku.

## 30.13 Oprávnění k notifikacím

Aplikace nemá žádat o povolení push notifikací bez vysvětlení při prvním okamžiku spuštění. Nejprve stručně vysvětlí, že upozornění připomínají rezervace a důležité změny.

---

# 31. Administrace – obecné požadavky

Administrace musí být webová, responzivní a použitelná na notebooku i tabletu.

Přihlášení administrátora musí být oddělené od běžného klientského účtu a chráněné silným heslem. Doporučena je vícefaktorová autentizace.

Hlavní části:

- dashboard;
- rozvrh;
- typy lekcí;
- termíny;
- instruktoři;
- klienti;
- rezervace;
- docházka;
- storno poplatky;
- novinky;
- galerie;
- recenze;
- obsah webu;
- nastavení;
- auditní log.

---

# 32. Administrace – dashboard

Dashboard má zobrazit jen praktické informace:

- dnešní lekce;
- počet rezervací na dnešek;
- termíny s naplněnou kapacitou;
- změny a zrušení;
- pozdní storna;
- neúčasti;
- nejbližší týden;
- rychlé tlačítko „Přidat termín“;
- rychlé tlačítko „Zrušit nebo změnit termín“.

Není třeba vytvářet složité finanční grafy, protože systém nezpracovává online platby.

---

# 33. Administrace – typy lekcí

U každého typu lekce lze spravovat:

- název;
- URL slug;
- krátký popis;
- dlouhý popis;
- hlavní fotografii;
- galerii;
- zaměření;
- přínosy;
- vhodnost;
- náročnost;
- výchozí délku;
- výchozí kapacitu;
- doporučený příchod;
- pomůcky;
- co si vzít;
- praktické upozornění;
- aktivní/neaktivní;
- pořadí na webu;
- SEO title;
- meta description;
- alternativní texty fotografií.

---

# 34. Administrace – instruktoři

U instruktora:

- jméno;
- příjmení;
- fotografie;
- krátké představení;
- delší profil;
- kontaktní údaj pouze interně;
- aktivní/neaktivní;
- přiřazené lekce;
- pořadí na webu.

Samostatný účet instruktora není povinný v první verzi.

---

# 35. Administrace – rozvrh a termíny

Administrátor musí umět:

- vytvořit jednorázový termín;
- vytvořit opakující se termín;
- nastavit začátek a konec opakování;
- zvolit den a čas;
- přiřadit typ lekce;
- přiřadit instruktora;
- nastavit délku;
- nastavit kapacitu;
- změnit doporučený příchod;
- upravit cenu;
- uzavřít rezervace;
- přesunout termín;
- zrušit termín;
- vytvořit výjimku v opakování;
- duplikovat termín;
- zobrazit rezervované klienty;
- vytisknout nebo exportovat seznam.

Rozvrh se nesmí hardcodovat podle prvního dodaného obrázku. Obrázek slouží jako počáteční obsah, ale následně musí být vše editovatelné.

---

# 36. Administrace – rezervace a docházka

U termínu zobrazit tabulku:

- klient;
- telefon;
- e-mail;
- čas vytvoření rezervace;
- stav;
- čas storna;
- typ storna;
- storno poplatek;
- interní poznámka.

Stavy rezervace:

- `reserved`;
- `cancelled_on_time`;
- `cancelled_late`;
- `attended`;
- `no_show`;
- `cancelled_by_studio`.

Administrátor může:

- vytvořit rezervaci za klienta;
- zrušit rezervaci;
- označit účast;
- označit neúčast;
- změnit stav;
- prominout storno;
- označit storno jako vyřešené;
- přidat interní poznámku.

Administrátor nesmí vidět ani zadávat údaje o platební kartě.

Volitelně může systém umožnit pouze interní ruční poznámku „zaplaceno hotově“ nebo „zaplaceno terminálem“. Tato funkce není platební integrace a může být vypuštěna z první verze, pokud ji provozovatelka nepotřebuje.

---

# 37. Administrace – klienti

Seznam klientů:

- jméno;
- příjmení;
- e-mail;
- telefon;
- datum registrace;
- poslední návštěva;
- počet rezervací;
- počet pozdních storen;
- počet neúčastí;
- stav účtu;
- interní poznámka.

Funkce:

- vyhledat;
- filtrovat;
- otevřít detail;
- opravit kontakt;
- deaktivovat účet;
- exportovat údaje klienta;
- vyřídit žádost o smazání;
- zobrazit audit změn.

Nezobrazovat permanentky ani online platební údaje.

---

# 38. Administrace – storno poplatky

Storno poplatek vzniká pouze při:

- pozdním stornu;
- neúčasti.

Datové stavy:

- `due` – vznikl a není vyřešen;
- `settled` – vyřešen ve studiu;
- `waived` – prominut;
- `cancelled` – zrušen kvůli opravě.

U záznamu:

- klient;
- lekce;
- datum;
- cena lekce;
- důvod;
- stav;
- poznámka;
- datum vyřešení;
- administrátor, který změnu provedl.

Systém automaticky nestrhává peníze a nevytváří online platební požadavek.

Automatické blokování dalších rezervací kvůli nevyřešenému storno poplatku není požadováno v první verzi. Administrace může pouze zobrazit upozornění.

---

# 39. Administrace – obsah webu

Administrace musí umožnit upravit bez programátora:

- hero nadpis a podtext;
- CTA;
- text O studiu;
- kontakty;
- adresu a mapu;
- parkování;
- sociální sítě;
- ceník;
- FAQ;
- galerii;
- recenze;
- novinky;
- právní dokumenty;
- popisy lekcí;
- profily instruktorů.

Změna obsahu nesmí vyžadovat nasazení nové verze aplikace, pokud jde o běžný text, fotografii, lekci nebo termín.

---

# 40. Role a oprávnění

## Návštěvník

- čte veřejný obsah;
- prohlíží rozvrh;
- otevře detail;
- nemůže rezervovat bez účtu.

## Klient

- spravuje svůj profil;
- rezervuje;
- ruší vlastní rezervace;
- vidí pouze své údaje;
- mění nastavení oznámení.

## Administrátor

- spravuje veškerý provozní a obsahový obsah;
- vidí klienty a rezervace;
- mění stavy;
- posílá oznámení;
- spravuje storna.

## Hlavní administrátor

- spravuje další administrátory;
- mění klíčová nastavení;
- vidí auditní log;
- provádí exporty a zásadní operace.

---

# 41. Datový model

Níže uvedený model je logický návrh. Vývojář může technické názvy upravit, ale musí zachovat význam.

## 41.1 User

```yaml
id: UUID
first_name: string
last_name: string
email: string unique
phone: string
password_hash: string
email_verified_at: datetime|null
status: active|disabled|deleted
marketing_consent: boolean
marketing_consent_at: datetime|null
terms_version: string
terms_accepted_at: datetime
created_at: datetime
updated_at: datetime
```

## 41.2 Instructor

```yaml
id: UUID
first_name: string
last_name: string
bio_short: text
bio_long: text
photo_asset_id: UUID|null
active: boolean
sort_order: integer
created_at: datetime
updated_at: datetime
```

## 41.3 ClassType

```yaml
id: UUID
name: string
slug: string unique
summary: text
description: rich_text
benefits: list
target_audience: list
difficulty: integer|null
default_duration_minutes: integer
default_capacity: integer
default_arrival_minutes: integer
equipment: list
what_to_bring: list
health_notice: text|null
hero_asset_id: UUID|null
active: boolean
featured: boolean
sort_order: integer
seo_title: string|null
seo_description: string|null
created_at: datetime
updated_at: datetime
```

## 41.4 ClassSession

```yaml
id: UUID
class_type_id: UUID
instructor_id: UUID
start_at: datetime
end_at: datetime
timezone: Europe/Prague
capacity: integer
arrival_minutes: integer
price: decimal
location_name: string
location_address: string
status: scheduled|cancelled|completed
booking_opens_at: datetime|null
booking_closes_at: datetime|null
public_note: text|null
internal_note: text|null
recurrence_group_id: UUID|null
created_at: datetime
updated_at: datetime
```

## 41.5 Booking

```yaml
id: UUID
session_id: UUID
user_id: UUID
status: reserved|cancelled_on_time|cancelled_late|attended|no_show|cancelled_by_studio
booked_at: datetime
cancelled_at: datetime|null
cancellation_cutoff_at: datetime
terms_version: string
terms_accepted_at: datetime
source: web|ios|android|admin
created_at: datetime
updated_at: datetime
```

Unikátní aktivní rezervace musí být zajištěna kombinací uživatele a termínu.

## 41.6 CancellationFee

```yaml
id: UUID
booking_id: UUID unique
amount: decimal
reason: late_cancellation|no_show
status: due|settled|waived|cancelled
resolved_at: datetime|null
resolved_by_admin_id: UUID|null
note: text|null
created_at: datetime
updated_at: datetime
```

## 41.7 Notification

```yaml
id: UUID
user_id: UUID
booking_id: UUID|null
type: booking_confirmation|reminder_24h|reminder_2h|reminder_30m|session_changed|session_cancelled|booking_cancelled|news
channel: email|push|in_app
scheduled_for: datetime
sent_at: datetime|null
status: pending|sent|failed|cancelled
failure_reason: text|null
created_at: datetime
```

## 41.8 Content entities

Dále minimálně:

- `NewsArticle`;
- `GalleryAsset`;
- `Review`;
- `FAQItem`;
- `PriceItem`;
- `ContentPage`;
- `StudioSettings`;
- `AdminUser`;
- `AuditLog`.

## 41.9 Co v datovém modelu nebude

- platební karta;
- platební token;
- online transakce;
- košík;
- objednávka;
- online permanentka;
- zůstatek vstupů;
- čekací listina;
- náhradník.

---

# 42. Stavové automaty

## 42.1 Rezervace

```text
reserved
 ├─> cancelled_on_time
 ├─> cancelled_late
 ├─> attended
 ├─> no_show
 └─> cancelled_by_studio
```

Povolené přechody musí být validovány na backendu. Administrátor může provést opravu s povinným auditním záznamem.

## 42.2 Termín

```text
scheduled
 ├─> cancelled
 └─> completed
```

## 42.3 Storno poplatek

```text
due
 ├─> settled
 ├─> waived
 └─> cancelled
```

---

# 43. API – doporučené rozhraní

Backend musí poskytovat dokumentované API sdílené webem, aplikací a administrací. Doporučena je REST architektura s OpenAPI dokumentací, případně rovnocenné řešení.

## 43.1 Veřejné endpointy

```text
GET /api/class-types
GET /api/class-types/{slug}
GET /api/sessions?from={date}&to={date}
GET /api/sessions/{id}
GET /api/instructors
GET /api/news
GET /api/gallery
GET /api/reviews
GET /api/prices
GET /api/faq
GET /api/studio
```

## 43.2 Autentizace

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/verify-email
GET  /api/me
PATCH /api/me
DELETE /api/me
```

## 43.3 Rezervace

```text
POST /api/bookings
GET  /api/me/bookings
GET  /api/me/bookings/{id}
POST /api/me/bookings/{id}/cancel
```

Server musí v odpovědi na storno uvést:

- zda bylo včasné;
- zda vznikl storno poplatek;
- jeho výši;
- že se řeší ve studiu.

## 43.4 Administrace

```text
GET/POST/PATCH /api/admin/class-types
GET/POST/PATCH /api/admin/sessions
POST /api/admin/sessions/{id}/cancel
POST /api/admin/sessions/{id}/notify
GET /api/admin/sessions/{id}/bookings
POST /api/admin/bookings
PATCH /api/admin/bookings/{id}
POST /api/admin/bookings/{id}/attendance
POST /api/admin/cancellation-fees/{id}/settle
POST /api/admin/cancellation-fees/{id}/waive
GET/POST/PATCH /api/admin/instructors
GET/PATCH /api/admin/users
GET/POST/PATCH /api/admin/content/*
GET /api/admin/audit-log
```

## 43.5 API pravidla

- jednotný formát chyb;
- validace na serveru;
- stránkování seznamů;
- filtrování;
- autorizace;
- ochrana proti opakovanému odeslání;
- idempotence vytvoření rezervace;
- správné časové pásmo;
- dokumentace;
- verzování API.

---

# 44. Technická architektura

Konkrétní technologie zvolí vývojář, ale architektura musí splnit následující:

```text
Web
Mobile App
Admin
   │
   └── Společné API
          │
          ├── Databáze
          ├── Úložiště fotografií
          ├── E-mailová služba
          ├── Push notifikace
          └── Audit a monitoring
```

Doporučené vlastnosti:

- relační databáze, například PostgreSQL;
- objektové úložiště pro fotografie;
- bezpečné API;
- oddělené prostředí vývoj/test/produkce;
- automatizované nasazení;
- zálohování;
- monitoring chyb;
- centrální správa konfigurace;
- žádná platební služba.

Web má být indexovatelný vyhledávači. Proto je vhodné serverové renderování nebo statické generování veřejných stránek.

---

# 45. Responzivita

Podporované rozsahy:

- mobil od přibližně 360 px;
- větší mobil;
- tablet;
- notebook;
- desktop;
- široký desktop.

Testovat minimálně:

- Safari na iOS;
- Chrome na Androidu;
- Safari na macOS;
- Chrome;
- Edge;
- Firefox v aktuálních verzích.

Web musí být plně použitelný dotykem. Klikací prvky musí mít dostatečnou velikost a rozestupy.

---

# 46. Přístupnost

Cílem je úroveň WCAG 2.2 AA.

Požadavky:

- dostatečný kontrast;
- ovládání klávesnicí;
- viditelné zaměření;
- popisky formulářů;
- alternativní texty;
- logické nadpisy;
- chybové zprávy spojené s polem;
- nekomunikovat stav pouze barvou;
- respektovat omezení animací v zařízení;
- dialogy musí správně pracovat s fokusem;
- tlačítka musí mít srozumitelné názvy.

Elegantní vzhled nesmí být na úkor čitelnosti.

---

# 47. Výkon

Cíle:

- rychlé první načtení;
- optimalizované fotografie;
- lazy loading galerie;
- minimalizace skriptů;
- cache veřejného obsahu;
- rozvrh načíst rychle;
- rezervaci potvrdit bez dlouhého čekání;
- zobrazit srozumitelný stav při pomalém připojení.

Aplikace má uložit základní informace o nejbližší rezervaci pro zobrazení při krátkodobém výpadku připojení. Novou rezervaci však nelze potvrdit offline.

---

# 48. Bezpečnost

Povinné:

- HTTPS;
- bezpečné ukládání hesel;
- vícefaktorové přihlášení administrátorů doporučeno;
- ochrana proti brute-force;
- rate limiting;
- ochrana proti běžným webovým útokům;
- bezpečné tokeny;
- krátká platnost resetovacích odkazů;
- oddělení rolí;
- audit administrativních změn;
- zálohy;
- obnova dat;
- neukládat platební karty;
- neukládat hesla do logů;
- bezpečné nahrávání souborů;
- antivirová nebo typová kontrola uploadů;
- pravidelné aktualizace závislostí.

---

# 49. Soukromí a osobní údaje

Systém má shromažďovat pouze údaje potřebné pro účet a rezervaci.

Požadavky:

- stránka ochrany osobních údajů;
- verze podmínek;
- evidence přijetí podmínek;
- samostatný marketingový souhlas;
- možnost marketingový souhlas odvolat;
- možnost požádat o export údajů;
- možnost požádat o zrušení účtu;
- interní pravidla uchování dat;
- omezený přístup administrátorů;
- audit zásadních změn;
- cookies lišta pouze podle skutečně používaných technologií.

Právní texty dodá nebo schválí provozovatelka. Vývojář je implementuje do systému a zajistí evidenci souhlasů.

---

# 50. SEO a dohledatelnost webu

Každá veřejná stránka má mít:

- unikátní title;
- meta description;
- správnou hierarchii nadpisů;
- čitelnou URL;
- Open Graph obrázek;
- canonical URL;
- sitemap;
- robots nastavení;
- strukturovaná data pro studio, kontakt a události, pokud jsou vhodná;
- optimalizaci pro lokální vyhledávání;
- rychlé načtení;
- textový obsah, který není pouze uvnitř obrázků.

Administrace má umožnit upravit základní SEO údaje u lekcí a obsahových stránek.

---

# 51. Analytika

Analytika je doporučená, ale musí respektovat soukromí.

Měřit zejména:

- návštěvy hlavních stránek;
- otevření rozvrhu;
- otevření detailu lekce;
- zahájení registrace;
- dokončení rezervace;
- storno;
- instalaci aplikace;
- otevření notifikace.

Administrativní statistiky:

- počet rezervací podle lekce;
- návštěvnost termínů;
- včasná storna;
- pozdní storna;
- neúčasti;
- nejčastější časy.

Nezavádět finanční analytiku online plateb, protože online platby neexistují.

---

# 52. Chybové a prázdné stavy

Systém musí mít navržené stavy, nikoli technické chyby bez vysvětlení.

## Příklady

### Žádné termíny

> Pro tento den zatím nejsou vypsané žádné lekce. Podívejte se na další den.

### Obsazeno

> Lekce je momentálně obsazena.

Bez tlačítka na čekací listinu.

### Rezervace mezitím naplněna

> Omlouváme se, lekce se právě obsadila. Vyberte si prosím jiný termín.

### Síťová chyba

> Připojení se nezdařilo. Zkontrolujte internet a zkuste to znovu.

### Chyba uložení

> Rezervaci se nepodařilo dokončit. Zkontrolujte prosím, zda se nezobrazila v části Moje rezervace, a zkuste to znovu.

### Neplatný odkaz resetu

> Odkaz již není platný. Nechte si poslat nový.

### Zrušená lekce

> Tato lekce byla zrušena. Podívejte se na jiné termíny.

---

# 53. UX pravidla formulářů

- minimum polí;
- jasné popisky nad polem;
- nevyužívat pouze placeholder;
- validace průběžně a po odeslání;
- zachovat zadaná data při chybě;
- telefon formátovat;
- heslo s možností zobrazit;
- jasné požadavky na heslo;
- potvrzovací tlačítko aktivní až po splnění povinných podmínek;
- po dokončení jasně zobrazit úspěch;
- neduplikovat souhlasy;
- nepoužívat předem zaškrtnutý marketingový souhlas.

---

# 54. Textové wireframy

## 54.1 Desktop homepage

```text
┌────────────────────────────────────────────────────────────────────┐
│ LOGO      O studiu  Lekce  Rozvrh  Galerie  Kontakt  [Rezervovat] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│            SCHVÁLENÁ FOTOGRAFIE STUDIA SE ZRCADLEM                │
│                                                                    │
│                    Najdi si svůj balans.                           │
│             Pohyb. Síla. Klid. Rovnováha.                          │
│             [Rezervovat lekci] [Rozvrh]                            │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ Pohyb, který dává smysl.             Fotografie / krátký text      │
├────────────────────────────────────────────────────────────────────┤
│ Vyberte si svůj pohyb                                           │
│ [Barre] [TRX] [Balance Flow]                                     │
│ [Jumping] [Kruhový trénink] [Power jóga]                         │
├────────────────────────────────────────────────────────────────────┤
│ Nejbližší lekce                                                   │
│ [termín] [termín] [termín]                                       │
├────────────────────────────────────────────────────────────────────┤
│ Studio / Galerie / Recenze                                        │
├────────────────────────────────────────────────────────────────────┤
│ Kontakt, mapa, sociální sítě                                      │
└────────────────────────────────────────────────────────────────────┘
```

## 54.2 Mobilní rozvrh

```text
< Rozvrh                 Tento týden >

Po  10.  Út 11.  St 12.  Čt 13.  Pá 14.

16:45–17:45
TRX
Instruktor
[Lze rezervovat]

18:00–19:00
Balance Flow
Instruktor
[Lze rezervovat]
```

## 54.3 Detail termínu

```text
[FOTOGRAFIE LEKCE]

Balance Flow
Čtvrtek 17:00–18:00
Doporučený příchod 16:50
Instruktor: ...

Krátký popis
Pro koho
Co vás čeká
Co si vzít
Pomůcky

Cena: ...
Platba až ve studiu.

Storno bez poplatku nejpozději 24 hodin před začátkem.

[Rezervovat lekci]
```

## 54.4 Aplikace – domů

```text
LOGO

Dobrý den, Moniko

Vaše nejbližší lekce
Balance Flow
Dnes 17:00–18:00
Přijďte prosím v 16:50

[Otevřít rezervaci] [Navigovat]

Nejbližší další lekce
Novinky
```

---

# 55. Akceptační kritéria webu

## WEB-001 Hero

- Domovská stránka používá schválenou fotografii studia.
- Fotografie obsahuje nebo používá správné oficiální logo.
- Je zobrazen slogan „Najdi si svůj balans.“
- Jsou viditelná tlačítka „Rezervovat lekci“ a „Rozvrh lekcí“.
- Mobilní ořez zachová hlavní motiv.

## WEB-002 Lekce

- Je zobrazen minimálně počáteční seznam lekcí.
- Každá karta vede na detail.
- Každý detail má fotografii, popis, zaměření, vhodnost, délku, pomůcky a CTA.
- Fotografie odpovídají reálným pomůckám.

## WEB-003 Rozvrh

- Rozvrh lze otevřít bez přihlášení.
- Lze přepínat týdny.
- Mobilní zobrazení je čitelné.
- Počet volných míst se nezobrazuje.
- Obsazená lekce nepovolí rezervaci.
- Neexistuje čekací listina.

## WEB-004 Obsah

- Provozovatelka může upravit kontakty, galerie, recenze, FAQ a ceník.
- Web obsahuje Facebook a Instagram.
- TikTok lze zapnout, pokud je vyplněna adresa profilu.
- Ceník neobsahuje online nákup.

## WEB-005 Technická kvalita

- Web je responzivní.
- Je ovladatelný klávesnicí.
- Fotografie jsou optimalizované.
- Veřejné stránky jsou indexovatelné.
- Chyby jsou srozumitelné.

---

# 56. Akceptační kritéria rezervačního systému

## RES-001 Vytvoření rezervace

- Nepřihlášený klient si může prohlédnout rozvrh.
- Při rezervaci se přihlásí nebo zaregistruje.
- Systém zkontroluje kapacitu.
- Dvojité kliknutí nevytvoří duplikát.
- Po potvrzení se rezervace zobrazí v účtu i administraci.
- Klient obdrží potvrzení.
- Nikde se nezobrazí online platební krok.

## RES-002 Platba

- Potvrzení říká, že klient platí ve studiu.
- Systém nepřesměruje na platební bránu.
- Systém neukládá kartu.
- Systém nenabízí Apple Pay ani Google Pay.
- Systém nenabízí online permanentku.

## RES-003 Kapacita

- Kapacita je interní.
- Veřejně se nezobrazuje číslo volných míst.
- Po naplnění je rezervace zablokována.
- Není čekací listina.

## RES-004 Včasné storno

- Při stornu alespoň 24 hodin před začátkem nevznikne poplatek.
- Stav je `cancelled_on_time`.
- Klient obdrží potvrzení.
- Místo se uvolní.

## RES-005 Pozdní storno

- Při stornu méně než 24 hodin před začátkem se zobrazí varování.
- Klient musí potvrdit pozdní storno.
- Stav je `cancelled_late`.
- Vznikne storno poplatek ve výši ceny lekce.
- Poplatek není inkasován online.
- Administrátor jej vidí.

## RES-006 Neúčast

- Administrátor může označit `no_show`.
- Vznikne storno poplatek ve výši ceny lekce.
- Administrátor jej může vyřešit nebo prominout.

## RES-007 Zrušení studiem

- Všem rezervovaným přijde oznámení.
- Nevznikne storno poplatek.
- Termín se nedá rezervovat.
- Změna se projeví na webu i v aplikaci.

---

# 57. Akceptační kritéria mobilní aplikace

## APP-001 Instalace a vzhled

- Aplikace je připravena pro iOS a Android.
- Používá oficiální logo.
- Používá stejnou barevnost a komponenty jako web.
- Nemá cizí vzhled rezervační platformy.

## APP-002 Domovská obrazovka

- Přihlášený klient vidí nejbližší rezervaci.
- Vidí čas i doporučený příchod.
- Může otevřít detail.
- Může spustit navigaci.

## APP-003 Rozvrh a rezervace

- Rozvrh je čitelný na mobilu.
- Detail obsahuje všechny požadované informace.
- Rezervace neobsahuje platbu.
- Obsazená lekce nemá waitlist.
- Počet volných míst není zobrazen.

## APP-004 Push notifikace

- Potvrzení a připomenutí se vážou ke správné rezervaci.
- Kliknutí otevře správný detail.
- Zrušení studiem je doručeno.
- Uživatel může upravit volitelná připomenutí.

## APP-005 Profil

- Uživatel upraví jméno, telefon, heslo a nastavení oznámení.
- Vidí své rezervace a historii.
- Nevidí permanentky ani online platby.
- Může požádat o zrušení účtu.

---

# 58. Testovací scénáře

## TC-01 Nový klient

1. Otevře web na telefonu.
2. Zobrazí rozvrh.
3. Otevře Balance Flow.
4. Vidí fotografii, obsah, pro koho je určena a co si vzít.
5. Klikne „Rezervovat“.
6. Vytvoří účet.
7. Potvrdí podmínky.
8. Rezervace se uloží.
9. Zobrazí se doporučený příchod.
10. Přijde e-mail.
11. Neproběhne žádná platba.

## TC-02 Obsazený termín

1. Poslední volné interní místo rezervuje klient A.
2. Klient B současně potvrdí rezervaci.
3. Backend klienta B odmítne s jasnou zprávou.
4. Klient B nevidí čekací listinu.
5. Klient B nevidí počet míst.

## TC-03 Včasné storno

1. Lekce začíná ve čtvrtek v 17:00.
2. Klient storno provede ve středu v 17:00.
3. Storno je bezplatné.
4. Nevznikne CancellationFee.

## TC-04 Pozdní storno

1. Lekce začíná ve čtvrtek v 17:00.
2. Klient storno provede ve středu v 17:01.
3. Zobrazí se upozornění.
4. Po potvrzení vznikne poplatek ve výši ceny lekce.
5. Žádná částka se online nestrhne.

## TC-05 Neúčast

1. Klient má aktivní rezervaci.
2. Po lekci administrátor označí neúčast.
3. Systém vytvoří storno poplatek.
4. Administrátor může poplatek označit jako vyřešený nebo prominutý.

## TC-06 Zrušení studiem

1. Administrátor zruší lekci.
2. Všem klientům přijde e-mail.
3. Uživatelům aplikace přijde push.
4. Rezervace mají stav zrušený studiem.
5. Nevznikne storno poplatek.

## TC-07 Změna času

1. Administrátor změní začátek z 17:00 na 18:00.
2. Aktualizuje se doporučený příchod.
3. Klient dostane oznámení s původním a novým časem.
4. Aplikace a web ukazují shodné údaje.

## TC-08 Přechod na letní čas

1. Termín je uložen v Europe/Prague.
2. Systém správně zobrazuje místní čas před i po změně času.
3. Připomenutí odchází podle místního času lekce.

## TC-09 Aktualizace obsahu

1. Administrátor změní fotografii Barre.
2. Změna se projeví na webu i v aplikaci.
3. Není nutné nové vydání aplikace.

## TC-10 Oprávnění

1. Klient se pokusí otevřít cizí rezervaci.
2. API přístup zamítne.
3. Událost se bezpečně zaloguje bez úniku osobních údajů.

---

# 59. Nefunkční požadavky

| ID | Požadavek |
|---|---|
| NFR-001 | Jedna databáze rezervací pro web i aplikaci |
| NFR-002 | Časové pásmo Europe/Prague |
| NFR-003 | Denní automatická záloha databáze |
| NFR-004 | Ověřený postup obnovy |
| NFR-005 | Monitoring chyb backendu a aplikace |
| NFR-006 | Bezpečný HTTPS provoz |
| NFR-007 | Dokumentované API |
| NFR-008 | Oddělené vývojové, testovací a produkční prostředí |
| NFR-009 | Responzivní web od šířky 360 px |
| NFR-010 | Přístupnost cílená na WCAG 2.2 AA |
| NFR-011 | Optimalizované fotografie |
| NFR-012 | Audit administrativních změn |
| NFR-013 | Žádné ukládání platebních údajů |
| NFR-014 | Žádná čekací listina |
| NFR-015 | Žádná online evidence permanentek |
| NFR-016 | Srozumitelné chybové stavy v češtině |
| NFR-017 | Jednotný design systém |
| NFR-018 | Možnost exportu rezervací do CSV |
| NFR-019 | Ochrana proti duplicitní rezervaci |
| NFR-020 | Správné transakční řízení kapacity |

---

# 60. Fáze realizace

## Fáze 0 – příprava

- převzetí originálního loga;
- převzetí schválené hero fotografie;
- převzetí fotografií lekcí;
- doplnění kontaktů;
- doplnění adresy;
- doplnění instruktorů;
- doplnění cen;
- doplnění textů;
- potvrzení rozvrhu;
- schválení storno podmínek;
- potvrzení stylu.

## Fáze 1 – design systém a prototyp

- barevné tokeny;
- typografie;
- komponenty;
- desktop homepage;
- mobilní homepage;
- desktop rozvrh;
- mobilní rozvrh;
- detail lekce;
- detail termínu;
- rezervační tok;
- aplikace domů;
- aplikace rozvrh;
- administrace rozvrhu.

Vývoj začne až po schválení klíčových obrazovek.

## Fáze 2 – backend a administrace

- datový model;
- autentizace;
- typy lekcí;
- termíny;
- kapacita;
- rezervace;
- storno;
- notifikace;
- klienti;
- obsah;
- audit.

## Fáze 3 – veřejný web

- všechny veřejné stránky;
- rozvrh;
- přihlášení;
- rezervace;
- účet;
- SEO;
- responzivita.

## Fáze 4 – mobilní aplikace

- iOS;
- Android;
- push;
- hluboké odkazy;
- vydání testovací verze;
- příprava obchodů s aplikacemi.

## Fáze 5 – testování

- funkční testy;
- testy storna;
- souběžné rezervace;
- mobilní zařízení;
- přístupnost;
- bezpečnost;
- obsah;
- notifikace;
- obnova ze zálohy.

## Fáze 6 – spuštění

- produkční doména;
- migrace počátečního obsahu;
- nastavení e-mailu;
- nastavení push;
- publikace aplikací;
- školení provozovatelky;
- předání dokumentace;
- záruční podpora.

---

# 61. Výstupy vývojáře

Vývojář předá:

1. zdrojové kódy;
2. repozitář;
3. design systém;
4. dokumentované API;
5. databázové migrace;
6. administrační příručku;
7. uživatelskou příručku;
8. instrukce k nasazení;
9. instrukce k zálohování a obnově;
10. přístupové údaje bezpečným způsobem;
11. seznam použitých služeb a jejich nákladů;
12. testovací scénáře a výsledek akceptace;
13. licenci nebo přehled licencí komponent;
14. podklady pro App Store a Google Play;
15. export všech produkčních dat při ukončení spolupráce.

Provozovatelka musí vlastnit nebo mít plný přístup k:

- doméně;
- hostingu;
- repozitáři;
- účtům pro odesílání e-mailů;
- účtům pro mobilní aplikace;
- analytice;
- databázi;
- fotografiím;
- administraci.

---

# 62. Obsah, který musí dodat provozovatelka

Před produkčním spuštěním je nutné dodat:

- oficiální logo v SVG a PNG;
- schválenou hero fotografii;
- fotografie všech lekcí;
- fotografie instruktorů;
- text O studiu;
- popisy lekcí;
- jména instruktorů;
- aktuální rozvrh;
- ceny;
- přesnou adresu;
- telefon;
- e-mail;
- odkazy na sociální sítě;
- informace o parkování;
- recenze;
- právní texty;
- případná zdravotní upozornění;
- údaje pro mapu;
- ikonu aplikace nebo schválení její varianty.

Dočasné placeholdery mohou být použity jen v prototypu, nikoli ve finální produkční verzi bez schválení.

---

# 63. Funkce určené až pro budoucí rozvoj

Následující funkce nejsou součástí první verze, ale architektura je může umožnit později:

- samostatný účet instruktora;
- workshopy;
- speciální akce;
- školení Balance Flow;
- certifikace;
- dárkové poukazy;
- firemní lekce;
- více poboček;
- vícejazyčný web;
- propojení s externím kalendářem instruktora;
- automatické Google recenze;
- marketingová automatizace;
- sociální přihlášení.

Ani budoucí rozvoj nesmí automaticky předpokládat online platby nebo permanentky. Tyto funkce mohou být přidány pouze na základě nového výslovného rozhodnutí provozovatelky.

---

# 64. Výslovně mimo rozsah

- online platební brána;
- Apple Pay;
- Google Pay;
- online platba kartou;
- online nákup lekce;
- online permanentky;
- přehled permanentek;
- odečítání vstupů;
- QR permanentka;
- košík;
- objednávky;
- e-shop;
- seznam náhradníků;
- čekací listina;
- číselné zobrazení volných míst;
- automatické stržení storno poplatku;
- SMS v první verzi;
- složité věrnostní body;
- gamifikace;
- veřejný chat;
- streamované lekce;
- medicínské poradenství.

---

# 65. Kontrolní seznam před převzetím

## Vizuál

- [ ] Použito správné logo.
- [ ] Použita správná hero fotografie.
- [ ] Logo nad zrcadlem není chybné.
- [ ] Fotografie lekcí mají reálné pomůcky.
- [ ] Barvy odpovídají studiu a vizitkám.
- [ ] Web i aplikace používají stejný design.

## Web

- [ ] Domů.
- [ ] O studiu.
- [ ] Lekce.
- [ ] Detail každé lekce.
- [ ] Rozvrh.
- [ ] Balance Flow.
- [ ] Galerie.
- [ ] Recenze.
- [ ] Ceník.
- [ ] Kontakt.
- [ ] FAQ.
- [ ] Právní stránky.
- [ ] Sociální sítě.

## Rezervace

- [ ] Rozvrh bez přihlášení.
- [ ] Přihlášení až při rezervaci.
- [ ] Kapacita funguje.
- [ ] Počet míst se nezobrazuje.
- [ ] Není čekací listina.
- [ ] Rezervace bez platby.
- [ ] Potvrzení uvádí platbu ve studiu.
- [ ] Včasné storno funguje.
- [ ] Pozdní storno funguje.
- [ ] Storno poplatek je cena lekce.
- [ ] Neúčast lze evidovat.
- [ ] Zrušení studiem neposuzuje poplatek.

## Aplikace

- [ ] iOS.
- [ ] Android.
- [ ] Domů.
- [ ] Rozvrh.
- [ ] Rezervace.
- [ ] Novinky.
- [ ] Profil.
- [ ] Push notifikace.
- [ ] Přímé otevření detailu z notifikace.
- [ ] Doporučený čas příchodu.
- [ ] Žádné permanentky.
- [ ] Žádné online platby.

## Administrace

- [ ] Typy lekcí.
- [ ] Instruktoři.
- [ ] Opakující se rozvrh.
- [ ] Výjimky a zrušení.
- [ ] Klienti.
- [ ] Rezervace.
- [ ] Docházka.
- [ ] Pozdní storna.
- [ ] Neúčasti.
- [ ] Galerie.
- [ ] Recenze.
- [ ] Novinky.
- [ ] Ceník.
- [ ] Kontakty.
- [ ] Audit.
- [ ] Export.

---

# 66. Definice hotového řešení

Projekt je považován za dokončený, pokud:

1. klient může na webu i v aplikaci zobrazit stejný aktuální rozvrh;
2. po kliknutí na termín vidí fotografii a kompletní informace;
3. může se jednoduše registrovat a rezervovat;
4. rezervace se uloží do jedné společné databáze;
5. nevznikne žádný online platební krok;
6. klient ví, že zaplatí hotově nebo terminálem ve studiu;
7. systém nezobrazuje online permanentky;
8. systém nezobrazuje počet volných míst;
9. systém nemá čekací listinu;
10. systém správně vyhodnocuje hranici 24 hodin;
11. pozdní storno a neúčast vytvoří storno poplatek ve výši ceny lekce;
12. storno poplatek se řeší pouze ve studiu;
13. klient dostává potvrzení a připomenutí s přesným časem a doporučeným příchodem;
14. provozovatelka sama spravuje rozvrh a obsah;
15. web i aplikace používají oficiální logo, schválené fotografie a jednotný elegantní vzhled;
16. řešení je zabezpečené, responzivní, přístupné a dokumentované;
17. vývojář předá zdrojové kódy, přístupy a dokumentaci.

---

# 67. Shrnutí pro vývojáře

Studio Balance potřebuje digitální řešení, které bude krásné a zároveň velmi jednoduché. Nejdůležitější je přehledný rozvrh, kvalitní detail lekce a rychlá rezervace. Klient musí před rezervací vědět, co ho čeká, pro koho je lekce určena, jaké pomůcky se používají, kdo ji vede, kdy má přijít a jak funguje storno.

Platby se neřeší online. Klient platí až ve studiu hotově nebo kartou přes fyzický terminál. Permanentky nejsou součástí klientského účtu. Nezobrazuje se počet volných míst a neexistuje čekací listina.

Vizuální styl musí vycházet z nového loga, schválené fotografie studia se zrcadlem, krémových a hnědých odstínů, měděných detailů a realistických fotografií lidí se skutečnými pomůckami.

Výsledkem má být jeden jednotný produkt: web, rezervace, mobilní aplikace a administrace, které spolu okamžitě sdílejí data a působí jako přirozená součást značky Studio Balance.

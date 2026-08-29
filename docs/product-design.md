# Produktový a UX/UI návrh

## Status a produktový záměr

Dokument je výchozí zdroj pravdy pro uživatelskou zkušenost. Cílem není
„fitness portál“, ale klidné a elegantní digitální pokračování boutique studia.
Nejdůležitější produktový výsledek je: návštěvník rychle porozumí nabídce a
klient bez zbytečné překážky najde, pochopí a rezervuje vhodný termín.

Finální vizuál podléhá schválení produkčních assetů. Referenční screenshot není
hotová obrazovka a nesmí převážit funkční zadání.

Implementovaný webový povrch zahrnuje veřejný web, rozvrh, klientský účet,
rezervaci/storno a první provozní řez administrace. Veřejný web používá dodané
logo a reálné fotografie pro zákaznické preview; jejich finální schválení
zůstává součástí akceptace.

## Uživatelé a jejich úlohy

| Role | Primární úloha | Signál úspěchu |
| --- | --- | --- |
| nový návštěvník | pochopit nabídku, vhodnost, cenu, místo a pravidla | otevře rozvrh nebo detail lekce bez tápání |
| pravidelný klient | rychle rezervovat, zkontrolovat nebo zrušit termín | dokončí úkon v několika jasných krocích |
| provozovatelka/admin | řídit rozvrh, obsah, klienty a změny bez vývojáře | běžná změna nevyžaduje release |
| super admin | spravovat oprávnění, kritická nastavení a audit | zásadní operace jsou řízené a dohledatelné |
| instruktor | v první verzi pouze veřejně prezentovaná osoba přiřazená k termínu | samostatné přihlášení není potřeba |

## Produktové metriky

Měřit lze až po schválení analytické technologie a consentu. Výchozí metriky:

- podíl návštěv rozvrhu, které otevřou detail termínu;
- dokončení rezervace po jejím zahájení;
- výskyt chyb `SESSION_FULL`, duplicit a nejasného výsledku rezervace;
- čas od otevření rozvrhu k potvrzení rezervace;
- úspěšné doručení potvrzení a provozních změn;
- včasná storna, pozdní storna a neúčasti podle typu/času;
- administrativní čas potřebný na změnu nebo zrušení termínu;
- frontendové chyby a opuštění kritických kroků.

Číselné cíle zatím nejsou schválené. Metrika nesmí zveřejnit kapacitu lekce ani
sbírat osobní údaje bez účelu.

## Kritické uživatelské cesty

| Cesta | Vstup | Úspěch | Selhání / fallback |
| --- | --- | --- | --- |
| první rezervace | homepage, detail lekce, rozvrh | účet + právě jedna potvrzená rezervace | zachovat vybraný termín a vysvětlit chybu |
| rychlá rezervace klienta | klientský účet nebo rozvrh | potvrzení bez platebního kroku | při souběhu nabídnout návrat na jiné termíny |
| kontrola nejbližší lekce | responzivní klientský účet | čas, příchod, místo, instruktor a navigace | při výpadku srozumitelná chyba a bezpečný retry |
| včasné storno | detail rezervace | zrušeno bez poplatku a místo uvolněno | bezpečný retry bez dvojí změny |
| pozdní storno | detail rezervace | klient nejprve pochopí cenu a potvrdí | výchozí akce je rezervaci ponechat |
| změna/zrušení studiem | e-mail/účet | klient vidí aktuální stav a rozdíl | e-mail je povinný fallback, stav je v účtu |
| správa termínu | admin rozvrh | vytvoření/změna/zrušení s auditní stopou | potvrzení dopadu před hromadnou notifikací |
| evidence docházky | admin termín | attended/no_show, případně právě jeden fee | oprava jen s důvodem a auditem |

## Informační architektura

### Veřejný web

Hlavní navigace: Domů, O studiu, Všechny lekce, Rozvrh, Galerie, Recenze,
Ceník, Kontakt a dominantní CTA „Rezervovat lekci“. Samostatná stránka metody
Balance Flow zůstává dostupná z obsahového zvýraznění na homepage, ale není
hlavní položkou mobilního menu. Na mobilu je navigace kompaktní, CTA na rozvrh
zůstává snadno dostupné a poslední oddělená položka „Přihlásit / Můj účet“ vede
nepřihlášeného návštěvníka přes přihlášení a přihlášeného přímo do klientského
přehledu. Otevřený panel se zavře klepnutím mimo něj, výběrem odkazu nebo
klávesou Escape.

Routes:

```text
/
/o-studiu
/lekce
/lekce/:slug
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

### Klientský účet

Responzivní klientská část vychází ze směru schváleného 13. 8. 2026: krémové
pozadí, hnědá typografie, měděné/zlatavé akce, elegantní nadpisové písmo,
oficiální logo a schválené fotografie lekcí. Úvod přivítá klientku, ukáže její
nejbližší rezervaci s fotografií a nabídne detail i bezpečné storno.

Spodní mobilní navigace má přesné pořadí Domů, Rozvrh, Rezervace, Oblíbené a
Profil. Klientský přehled dále obsahuje nadcházející/minulé rezervace, novinky,
zprávy účtu, profil, nastavení a odhlášení. Rozvrh, detail i rezervační krok
zůstávají součástí stejného responzivního webu a používají tentýž serverový stav
jako desktop a administrace. Číselný počet volných míst z referenčních obrázků
se nepřebírá; veřejné UI ukazuje pouze slovní stav. Permanentky, doporučovací
slevy, nativní aplikace a mobilní push nejsou tímto vizuálem schválené.

Pokud profil nese roli `admin` nebo `super_admin`, zobrazí v nastavení samostatný
vstup „Správa studia“. Běžný klient jej nevidí. Administrátor při přihlášení do
aplikace dokončí heslo i TOTP; stejná serverová relace pak otevře správu přímo,
bez druhého formuláře. Pokud relace neobsahuje podepsaný důkaz OTP, přejde uživatel
na záložní oddělené ověření. Po úspěchu zůstane zabezpečený přístup při volbě
zapamatovaného zařízení použitelný až 90 dní, pokud se používá nejméně jednou za
30 dní. Odkaz nenahrazuje serverovou kontrolu role ani povinné MFA.

Klientský účet používá pouze neprůhlednou serverovou `HttpOnly` relaci. Volba
„Zapamatovat toto soukromé zařízení na 90 dní“ je v aplikaci jediná volba pro
trvalejší přihlášení; bez ní je cookie jen do zavření prohlížeče. Obě varianty
se při neaktivitě po 30 dnech ukončí. Přihlášený klient proto při běžném návratu
nezadává heslo znovu; explicitní odhlášení zruší klientskou i administrátorskou
relaci aplikace na daném zařízení.

### Administrace

Primární oblasti: Dashboard, Rozvrh, Typy lekcí, Instruktoři, Klienti,
Rezervace/docházka, Storno poplatky, Obsah, Nastavení, Audit. Navigace je
úkolová, ne kopie veřejného webu.

Dashboard vedle dnešního provozu ukazuje oblíbenost typů lekcí za posledních
90 dní, osmitýdenní trend potvrzených návštěv, týdenní rezervace, měsíční
účast, pozdní storna a neúčasti. Finanční karta používá přesný název „Odhad
hodnoty návštěv“ a nápovědu, že jde pouze o součet cen rezervací označených jako
účast. Dokud systém neeviduje skutečné zaplacení, nesmí používat označení
tržba, výdělek nebo příjem.

## Inventář hlavních povrchů

| Povrch | Hlavní rozhodnutí / akce | Povinné stavy |
| --- | --- | --- |
| homepage | pochopit studio, otevřít rozvrh | načítání hero, chybějící nejbližší termíny |
| seznam lekcí | zvolit vhodný typ | empty filtru, chybějící foto |
| detail typu | porozumět obsahu a najít termín | žádný budoucí termín |
| rozvrh | vybrat den a termín | loading, prázdný den, full, closed, cancelled, chyba |
| detail termínu | ověřit čas, vhodnost, cenu, pravidla | disabled CTA podle veřejného stavu |
| auth v rezervaci | přihlásit/registrovat bez ztráty kontextu | validace, existující e-mail, nevyplněný profil |
| potvrzení rezervace | zkontrolovat výsledek | nejasný timeout vede ke kontrole „Moje rezervace“ |
| moje rezervace | otevřít nejbližší/historii | empty state pro nového klienta |
| storno dialog | porozumět důsledku | on-time a late jsou dva rozdílné vzory |
| klientský přehled | jedním pohledem zjistit nejbližší termín | bez rezervace, loading, chyba |
| admin rozvrh | řídit série a výjimky | konflikty, dopad na klienty, neuložené změny |
| admin termín | seznam klientů a docházka | prázdný seznam, export, oprava stavu |

## Homepage – doporučená hierarchie

```text
hero + značka + dvě CTA
→ krátké představení a hodnoty
→ vizuální karty lekcí
→ několik nejbližších termínů
→ příběh/interiér
→ zvýrazněný Balance Flow
→ galerie a recenze
→ kontakt, mapa a finální CTA
→ právní a kontaktní footer
```

Hero používá slogan „Najdi si svůj balanc.“ a volitelně „Pohyb. Síla. Klid.
Rovnováha.“ Fotografie a text nesmí soupeřit; mobilní ořez zachová zrcadlo a
atmosféru.

Recenzní pás používá tři až šest ručně schválených referencí. Na desktopu jsou
karty v klidné mřížce, na mobilu se posouvají po jedné bez autoplay. Hodnocení
recenze je volitelné a vizuálně i přístupnostním popiskem se odlišuje od
náročnosti lekce. Pokud není publikovaná žádná skutečná recenze, homepage celý
pás vynechá a stránka Recenze zobrazí pravdivý prázdný stav. Schválený zdroj a
datum se zobrazí jen tehdy, pokud byly skutečně dodány; samostatná stránka vždy
nabídne CTA do rozvrhu a používá společný kontaktní footer.

### Instalace webu (PWA)

Web lze nainstalovat jako PWA pod názvem Studio Balance. Používá oficiální logo
jako instalační ikonu, vlastní barevnost a samostatnou stránku pro stav bez
připojení. Offline zůstávají dostupné jen bezpečně uložené statické soubory;
rezervační data, rozvrh, přihlášený účet a API se necachují jako aktuální obsah
a rezervaci nelze bez připojení provést.

V přihlášeném profilu se dočasně zobrazí srozumitelná karta „Měj studio vždy po
ruce“. Stejná volba „Přidat aplikaci“ je vždy dostupná i ve veřejném mobilním
menu, aby instalace nevyžadovala přihlášení ani počítač. Na iOS otevře krátký
návod Safari: Sdílet → Přidat na plochu → Přidat. Na zařízeních, která podporují
instalační dialog prohlížeče, nabídne jediné tlačítko „Přidat na plochu“. Když
prohlížeč instalační dialog neposkytne, zobrazí očíslované kroky a výslovně
uvede, že názvy položek nejsou tlačítka webu. Po instalaci se volba již
nezobrazuje; návod se nesmí vydávat za nativní aplikaci.

## Rozvrh a veřejné stavy

Desktop používá vzdušné karty po dnech, nikoli excelovou mřížku. Mobil používá
horizontální výběr dne a svislý seznam. Celá karta je klikací.

| Doménový stav | Veřejný text | CTA |
| --- | --- | --- |
| `bookable` | Lze rezervovat | aktivní „Rezervovat lekci“ |
| `full` | Lekce je obsazena | disabled, bez waitlistu |
| `closed` | Rezervace uzavřena | disabled |
| `cancelled` | Lekce zrušena | žádná rezervace, nabídnout rozvrh |
| `completed` | Proběhlo | historie, bez CTA |

Nikde se nezobrazuje `capacity`, `remaining`, „poslední N míst“ ani falešná
naléhavost.

## Rezervační tok

```text
rozvrh
→ detail konkrétního termínu
→ přihlášení nebo krátká registrace v kontextu
→ souhrn + cena + platba ve studiu + storno
→ jednoznačné potvrzení
→ výsledek + kalendář/navigace/moje rezervace
```

Tlačítko během odesílání zobrazí průběh a zamezí opakovanému kliknutí. Backend
je přesto idempotentní. Pokud odpověď selže po uložení, text vede klienta nejprve
zkontrolovat „Moje rezervace“, aby nevznikla panika ani nový pokus naslepo.

## Storno UX

Včasné storno používá klidný potvrzovací dialog a jasně říká „bez storno
poplatku“. Pozdní storno je destruktivní akce s částkou, pravidlem a informací,
že se řeší ve studiu. Primární bezpečná volba je „Ponechat rezervaci“;
destruktivní tlačítko nese plný text „Zrušit se storno poplatkem“.

## Design systém

### Výchozí tokeny k vizuálnímu ověření

| Token | Výchozí hodnota | Použití |
| --- | --- | --- |
| `color.bg.primary` | `#F7F3EE` | hlavní krémové pozadí |
| `color.bg.secondary` | `#E8DDD0` | pískové sekce a karty |
| `color.bg.light` | `#FFFDF9` | světlé plochy |
| `color.text.primary` | `#3E332D` | hlavní tmavě hnědý text |
| `color.text.secondary` | `#6B584A` | sekundární text |
| `color.accent` | `#B56E4F` | měděný akcent a primární CTA |
| `color.border` | `#DCCDBD` | jemné oddělení |
| `color.success` | TBD | tlumený přírodní odstín s AA kontrastem |
| `color.warning` | TBD | tlumený okrový odstín s AA kontrastem |
| `color.error` | TBD | tlumený cihlový odstín s AA kontrastem |

Hodnoty jsou startovací, ne schválený brand manuál. Sémantické barvy musí být
odladěny na kontrast; stav se nikdy nesděluje pouze barvou.

### Typografie

- elegantní, současný serif pro display a hlavní nadpisy;
- vysoce čitelný sans-serif pro text, formuláře, data, časy a tlačítka;
- konkrétní rodiny a licenční podmínky se schválí ve fázi design systému;
- základní text na mobilu nesmí být zmenšen kvůli vizuální jemnosti;
- číslice časů a cen musí být snadno porovnatelné.

### Tvar a prostor

- explicitní spacing stupnice navržená na 4px základu;
- měkké, konzistentní radiusy, lehký stín a jemné linky;
- dostatek whitespace; nevkládat obsah do karet jen kvůli dekoraci;
- dotykový cíl nejméně 44 × 44 CSS px / platformní ekvivalent;
- maximální šířka textových odstavců přibližně 65–75 znaků.

### Fotografie a značka

- pouze poslední schválené logo, bez překreslování a deformace;
- produkční SVG + transparentní PNG a schválená varianta favicon;
- skutečné schválené fotografie studia, lidí a používaných pomůcek;
- desktop/mobil crop, moderní komprese, `srcset`, lazy loading mimo LCP a alt;
- plakátové preview na kartě lekce vyplní jednotný rámeček (`cover`) s
  kontrolovaným cropem od horní hrany; nesmí se oříznout název ani hlavní motiv;
- detail lekce vždy zobrazí celý plakát (`contain`); přebytečný prostor vyplní
  ztlumené pozadí vytvořené z téhož obrazu, aby se nezkreslil ani obsah plakátu,
  ani rozvržení detailu;
- žádné nesmyslné/deformované vybavení ani generický AI obraz v produkci.

## Komponenty a stavová pravidla

Každá znovupoužitelná komponenta definuje:

- `loading`: skeleton odpovídá výslednému layoutu a nezpůsobí posun;
- `empty`: vysvětlení a užitečný další krok, ne prázdný panel;
- `disabled`: viditelný důvod, ne pouze šedá barva;
- `success`: jednoznačný výsledek a relevantní další akce;
- `validation_error`: chyba u pole i souhrn, fokus na první chybu;
- `system_error`: lidský český text, retry a request ID pro podporu;
- `permission_denied`: bez úniku existence cizího objektu;
- `network_error`: zachovat kontext, nabídnout bezpečný retry a nezobrazit
  neověřený výsledek změnové akce.

Formuláře mají trvalé labely, zachovají data po chybě, formátují telefon,
umožní zobrazit heslo a nepředvyplní marketingový souhlas.

Keycloak přihlášení vizuálně navazuje na Studio Balance, ale neskrývá význam
bezpečnostních kroků. Nový klient po registraci doplní profil a vrátí se k
vybranému termínu. Admin MFA vysvětlí nastavení faktoru,
recovery a chybu bez možnosti bezpečnostní krok přeskočit.

### Keycloak login theme

Realm `studio-balance` používá vlastní responzivní login theme nad
`keycloak.v2`. Desktop kombinuje schválenou fotografii studia, oficiální logo
a samostatný světlý formulářový panel. Pod 900 px se fotografie mění na krátký
horní vizuální pás a formulář zůstává v jediném sloupci bez horizontálního
scrollu. Téma pokrývá přihlášení, registraci, obnovu hesla, chyby a nastavení
ověřovací aplikace. Výchozí jazyk je čeština s angličtinou
jako podporovanou variantou.

Téma nemění OIDC, neobchází Keycloak formuláře a nenačítá externí fonty ani
skripty. Hesla, OTP, QR secret, recovery kódy a validační chyby nadále zpracovává
výhradně Keycloak. Všechny prvky mají trvalý label, dotykovou výšku alespoň
48 px, viditelný fokus, kontrastní chybový stav a respektují
`prefers-reduced-motion`.

## Interakce a motion

### Proměny před/po a administrační nápověda

Veřejná karta zobrazuje fotografie ve stejně velkých sousedních polích s
trvalými štítky „Před“ a „Po“, pravdivým příběhem a schváleným označením
klientky. Bez publikovaných položek se blok na titulní stránce vůbec nevykreslí;
nevzniká náhradní nebo ilustrační proměna. Text neslibuje hubnutí ani léčebný
výsledek a samostatná stránka připomíná individuálnost výsledků.

Administrace používá u méně samozřejmých polí malé tlačítko s otazníkem.
Nápověda se zobrazí hoverem i fokusem, má vlastní přístupný název, neotevírá
novou stránku a na mobilu nepřetéká mimo viewport. Vysvětluje zejména souhlas,
publikaci, zvýraznění, pořadí, kapacitu, cenu a pravidla fotografií; chyba po
uložení zůstává samostatnou čitelnou zprávou.

- motion slouží orientaci a zpětné vazbě, ne dekorativnímu předvádění;
- mikroanimace typicky 150–250 ms; delší přechod jen s jasným důvodem;
- žádný layout shift, parallax blokující výkon ani automatické hlučné video;
- respektovat `prefers-reduced-motion` a platformní reduced motion;
- loading animace nesmí zakrýt pomalý backend ani umožnit dvojí rezervaci.

## Responzivita

- web podporuje šířku od 360 px, větší mobil, tablet, notebook a desktop;
- breakpoints se zvolí podle obsahu, ne podle konkrétních modelů zařízení;
- týdenní rozvrh se na mobilu transformuje na výběr dne + seznam;
- dialog detailu je na desktopu modal nebo stránka, na mobilu celá obrazovka;
- administrace je prioritně notebook/tablet; tabulky se nesmí jen zmenšit, ale
  používají prioritní sloupce, detail nebo horizontální scroll s kontextem;
- sticky CTA nesmí překrýt obsah ani systémová gesta.

## Přístupnost

Cíl je WCAG 2.2 AA.

- logická struktura nadpisů a landmarky;
- plné ovládání klávesnicí a viditelný fokus;
- správný focus trap/restore v dialogu, Escape a označené close;
- label, instrukce a chyba programově spojené s formulářem;
- živé regiony pro asynchronní výsledek rezervace bez zahlcení;
- alternativní text popisuje účel obrazu; dekorace mají prázdný alt;
- stav není sdělen jen barvou, ikonou nebo polohou;
- dostatečný kontrast, text zoom a reflow;
- čitelné datum/čas a lokalizované názvy bez nejasných zkratek;
- automatizovaný audit doplňuje, nikoli nahrazuje ruční klávesnici a čtečku.

## Důvěra, tón a konverze

Tón je klidný, profesionální, lidský a podporující. Nepoužívá agresivní fitness
slogany, sliby hubnutí, falešnou naléhavost ani přehnané vykřičníky. Důvěru
tvoří reálné studio a lidé, jasná vhodnost lekce, skutečné recenze, přesný čas,
adresa, platba ve studiu a viditelné storno pravidlo.

## Frontend observabilita

Sledovat bez citlivého obsahu: načtení/selhání rozvrhu, otevření detailu,
zahájení/dokončení rezervace, veřejný `SESSION_FULL`, chybu/timeout, storno,
frontendovou výjimku a latency. Nikdy nelogovat heslo, token, obsah interní
poznámky nebo nadbytečné osobní údaje.

## Vizuální QA gate

- [ ] použitá varianta loga a všechny fotografie jsou schválené;
- [ ] nikde není počet míst, waitlist, online platba nebo permanentka;
- [ ] homepage, rozvrh, detail a booking fungují na 360 px i desktopu;
- [ ] všechny doménové, prázdné, chybové a permission stavy jsou navržené;
- [ ] klávesnice, fokus, dialogy, kontrast a reduced motion prošly kontrolou;
- [ ] CTA a texty odpovídají klidnému tónu a českému zadání;
- [ ] produkční fotografie mají správný crop, kompresi a alt;
- [ ] rezervace a storno mají jednoznačný výsledek i při pomalé síti;
- [ ] klientský účet a rezervace jsou plnohodnotně použitelné v mobilním browseru;
- [ ] admin workflow bylo ověřeno s provozovatelkou na notebooku/tabletu.

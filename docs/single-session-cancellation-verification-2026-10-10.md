# Ověření zrušení jednoho termínu — 2026-10-10

Rozsah CD-071: srozumitelný výběr data a jedné konkrétní lekce v Rozvrhu,
vložené potvrzení a kontextová nápověda. Stejný formulář otevírá Zrušit
v týdenním seznamu. Žádné změny API, databáze, MFA ani pravidel storna.

## Automatické kontroly

- Cílený ESLint nových komponent, testu a integrace: prošel.
- Kontrola typů webu: prošla.
- Webové testy: 22 souborů, 215 testů, všechny prošly. Nové scénáře ověřují
  místní datum přes půlnoc a DST, filtrování budoucích naplánovaných lekcí,
  kontrolu změněných údajů a výchozí nepotvrzený stav.
- Produkční sestavení webu: prošlo.
- Kontrola dokumentačního skeletu a analytické hranice: prošly.
- Nezávislá revize: opraveno zachování nabídky po úspěchu a starý seed po
  návratu do Rozvrhu; potvrzení používá jedno UUID a před POST nový GET.

## Prohlížeč na izolovaných datech

Skutečná komponenta a aktuální styly běžely na loopback testovací stránce.
Všechny API odpovědi byly v paměti, žádné spojení s produkčními API ani
produkční přihlašovací údaje. Toto ověření není živé storno ani test
databázové transakce.

- 360 px: karta a její pole/tlačítka nepřetékají; potvrzení má touch cíle
  nejméně 44 px. Desktop 1280 px: bez vodorovného přetečení.
- Konkrétní datum za hranicí 14 dní nabídne příslušnou lekci a instruktora.
- Úspěch odešle jediný POST pro vybraný termín, ořízne mezery důvodu;
  druhý termín stejného dne i termín v jiném dni zůstanou naplánované.
- Změna počtu rezervací před kontrolním GET: žádný POST, aktuální počet
  a požadavek nového potvrzení.
- 401, chyba kontrolního spojení a chyba POST zachovají důvod, neukážou
  falešný úspěch. Důvod tvořený jen mezerami neodešle žádný požadavek.
- Dvojklik při pomalém GET/POST: jeden GET a jeden POST, ovládání je zamčené.
- Ponechat termín neprovádí změnu a vrátí focus na datum. Výběr a návrat
  fungují přes Enter; po výběru má focus nadpis potvrzení.
- Opuštění karty během pomalého kontrolního GET neodešle storno.

## Stav a návaznost

Změna není v této fázi nasazená. Žádná skutečná lekce ani rezervace nebyla
zrušena a klientům nebyly poslány zprávy. Po případném nasazení ověřit
Rozvrh v přihlášené administraci bez dokončení skutečného storna.

MCP kontext/reindex tohoto pracovního checkoutu skončil chybou. Čtení
canonical indexu bylo dostupné; změny byly ověřené přímo v aktuálním
checkoutu. Scoped CLI reindex byl ukončen po čekání bez výsledku.
Sdílená Chroma ani její allowlist se kvůli této úpravě neměnily.

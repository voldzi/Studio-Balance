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

Změna byla 10. 10. 2026 nasazena do produkce jako revize
`3e6691c0967e5470842a9199f10777e80394ba0a`. Předchozí obnovitelná verze
je `27b6e11`; návrat: `pnpm rollback:production -- 27b6e11`.

- Všechny tři služby jsou healthy; kontrola přesné revize, API readiness,
  webu a úspěšného prvního běhu workeru prošla.
- Trivy: 0 HIGH / 0 CRITICAL pro OS i knihovny všech tří obrazů.
- Web: `sha256:0990cfbe0dd9392034d22ebda411b6c7786ba9d15005225790e6e62b860953c7`.
- API: `sha256:cae00a927ddf71aaa4759afae04c13b2676ccbbb173b78a7aac8ae5a23877d6e`.
- Worker: `sha256:c9a5f3825c776e048e87a1ee6f01fa4e755d648644a1d65bbd4d6d7751e5eeab`.
- Veřejný web i rozvrh vrací 200; admin API bez přihlášení 401.
- Živá přihlášená administrace: 6. 11. 2026 nabídlo Latino Ladies
  17:30–18:30, Xavier Tihelka; potvrzení ukázalo 0 rezervací.
  Nápověda byla otevřená, potvrzení bez souhlasu disabled. Použito pouze
  „Ponechat termín“; žádná skutečná lekce ani rezervace nebyla zrušena.
- Obnovení stránky zachovalo přihlášení. X5 UUID i kapacitní brány prošly.
  Poslední mediální záloha je z 10. 10.; databázová obnova se neprováděla.
- Retence po nasazení zachovává aktuální a dvě předchozí ověřené verze.
- Opravena falešná chyba analytické release kontroly: `rg -q` předčasně
  zavíral rouru a `pipefail` interpretoval SIGPIPE jako zakázané měření.
  Kontrola čte celý vstup; schválené flags, SRI a soukromé hranice zůstávají.
  Analytické testy 33 + 56 prošly.

MCP kontext/reindex tohoto pracovního checkoutu skončil chybou. Čtení
canonical indexu bylo dostupné; změny byly ověřené přímo v aktuálním
checkoutu. Scoped CLI reindex byl ukončen po čekání bez výsledku.
Sdílená Chroma ani její allowlist se kvůli této úpravě neměnily.

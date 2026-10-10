# Klientské recenze — ověření vydání

Datum: 2026-10-10. Rozsah: CD-072 / ADR 0029, veřejný formulář,
moderace, tisk QR a krátkodobá ochrana proti spamu.

## Před nasazením

- `pnpm check` prošlo: lint, typy, 506 testů (API 240, web 254, worker 5,
  doména 7), sestavení a všechny repository gates.
- PostgreSQL integrační testy běžely na samostatném lokálním PostgreSQL 18
  v tmpfs; nepoužily produkční data ani přístupy.
- V prohlížeči ověřeno: chybějící údaje a focus na první chybu; anonymní
  odeslání do neveřejné fronty; admin kontrola a samostatné potvrzení;
  schválení přesného textu; následné skrytí zkráceným PATCH.
- Mobilní formulář při 360 px nepřetéká. Souhlas není předvolený;
  hvězdičky jsou dobrovolné. Nové cesty jsou noindex a mimo analytics allowlist.
- QR PNG byl nezávisle dekódován: `https://studio-balance.cz/recenze/napsat`.
  Tisková kartička a SVG/PNG byly ověřeny v prohlížeči.
- Nezávislá revize opravila kontrolu původu admin rozhodnutí, bezpečné DB
  chyby, vazbu zobrazovaného souhlasu na jeho verzi, editaci zobrazení
  schválené recenze a délku Unicode shodnou s PostgreSQL.
- Aktuální audit závislostí prošel se stávající ověřenou opravou vývojového
  `braces` (122 regresí); žádné nové knihovny ani tajemství nejsou potřebné.
- Produkční DMZ přepisuje X-Forwarded-For na jedinou `$remote_addr`.
  Interní API port 4281 není přes veřejnou doménu z této kontrolní sítě
  dosažitelný; síťová pravidla se tímto vydáním nemění.
- Produkční migrator má default privileges pro aplikační roli na nových
  tabulkách. X5 guard prošel. Předchozí zdravá verze je
  `3e6691c0967e5470842a9199f10777e80394ba0a`.

## Produkční ověření

Zatím čeká na nasazení. Tato část nesmí být považována za potvrzení aktivace.

## Návrat

Standardní `pnpm rollback:production -- 3e6691c0967e5470842a9199f10777e80394ba0a`.
Migrace je aditivní; při návratu obrazu ponechat návrhy recenzí i audit v DB.
Neprovádět destruktivní down migraci. Zálohy a X5 retence se nemění.

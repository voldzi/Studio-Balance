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

Nasazeno 2026-10-10, přepnutí v 19:11 UTC. Standardní vzdálený deployment
skončil s kódem 0. Produkční web, API a worker mají shodnou revizi
`082d9ce7fda001c85deb0479a1b1fe59dcd8fb69` a stav `healthy`; samostatný
`verify-production-revision.py` ověřil přesnou revizi znovu po nasazení.

| Služba | Ověřený běžící image ID |
| --- | --- |
| web | `sha256:cdd83271106b0e9db3c8ce33a1828148c1db1e22d3563ea253f7a047c960a341` |
| API | `sha256:579daa859f7e63cdcd9feca1ae16ad49ec7edf27b4dbd1ea518000bdf008e6b1` |
| worker | `sha256:a1bf4dd81cd4a44b3eb79ad0b777e3669cfb35bec3e90cd093c9b787cce1de07` |

- Před spuštěním prošly všechny tři přesné obrazy připnutým Trivy skenem:
  HIGH 0 / CRITICAL 0, včetně OS a aplikačních balíčků. Pokrytí:
  web 18 OS + 21 knihoven, API 18 + 131, worker 18 + 16.
  Serverová evidence je v
  `/srv/x5-production/archives/studio-balance/image-scans/082d9ce7fda001c85deb0479a1b1fe59dcd8fb69/20261010T191041Z-joPUikeS/verified.json`.
- Migrace `0032_public_review_submissions.sql` byla aplikována v
  `2026-10-10T19:11:08.121Z`. Kontrolní součet DB se shoduje s nasazeným
  souborem: `56388bb55db06ff13372ecfe5356c5571993f6311949580e67f74ab214d5d9f2`.
  API používá `PUBLIC_APP_URL=https://studio-balance.cz`.
- Hlavní veřejná stránka vrací 200 a obsahuje odkaz „Napsat recenzi“
  na `/recenze/napsat`.
- Přes veřejnou HTTPS adresu: `/recenze`, `/recenze/napsat`, `/recenze/qr`
  a oba QR soubory vrátily 200. Nové stránky obsahují noindex; zveřejněný
  formulář má přesný souhlas a kontakt pro jeho odvolání.
- Challenge vrací 200, správnou verzi `reviews-public-v1-2026-10-10` a
  životnost 30 minut, `private, no-store`, bez Set-Cookie.
  POST bez Origin nebo s cizím Origin vrací 403; chybějící souhlas,
  zastaralá verze souhlasu a neplatný token vrací 400. Všechny chyby mají
  smluvenou obálku ErrorResponse, requestId, no-store, nevypisují návrh ani
  token a nenastavují cookies. Nepřihlášený admin GET vrací 401/no-store.
- Neplatné testy nevytvořily žádnou recenzi ani antispamový záznam:
  agregované počty po kontrolách byly obě 0. Platné odeslání, rozhodnutí
  a následné skrytí byly ověřeny pouze v izolovaném lokálním prostředí;
  do produkce jsme nevložili syntetický veřejný obsah.
- V přihlášeném produkčním prohlížeči ověřeno: Recenze, prázdná fronta,
  přepínání stavů, odkazy na formulář/QR a rozbalená srozumitelná nápověda.
  Při přepnutí filtrů byly zaznamenány tři síťové požadavky, žádný do analytics.
  Anonymní analytická ochrana nových cest je ověřena přes přesný allowlist,
  unit/release kontroly a sestavenou konfiguraci; samostatný anonymní
  browserový síťový průchod produkcí nebyl proveden, protože používaný
  profil obsahuje přihlášenou relaci. Rozsah měření se tímto vydáním nemění.
- Veřejné SVG i PNG jsou byte-exact shodné s commitem. PNG SHA-256:
  `52e483a4407ae6d34185546f73a223aea01132ff805cd8959a0a5660b1aebedc`.
  Nezávislý dekodér i na produkčním PNG potvrdil
  `https://studio-balance.cz/recenze/napsat`. Tisková stránka byla vizuálně
  ověřena. Fyzický tisk a sken na konkrétním telefonu nebyly provedeny.
- Worker vytvořil readiness po úspěšné kontrole rozvrhu (created=0,
  skipped=136). Nasazená funkce úklidu krátkodobých rate záznamů se
  vykonala bez chyby (removed=0); běží také odděleně při startu a po 10 minutách.
- Porovnání před/po: 110 běžících kontejnerů v obou snímcích; změnily se
  tři služby Studia Balance. Z ostatních 107 identit zůstalo 106 stejných;
  v intervalu se změnil také VCode analytics dashboard, který tento
  deployment neovládá. Do jeho konfigurace ani služeb jsme nezasahovali.
- Dočasný lokální PostgreSQL pouze s testovacími daty v tmpfs byl odstraněn
  po ověření vlastní značky. Syntetická browserová cookie a lokální fixture
  byly odstraněny. Produkční data, rezervace a oprávnění správců se neměnily.

## Index zdrojů

MCP reindex aktuálního pracovního stromu nebyl dostupný; CLI handoff jej
odmítl jako projekt mimo výběr aplikace. Původní canonical index jsme
nepřepsali obsahem jiného checkoutu. Zdrojem ověřených změn je výše uvedený
Git commit; kontrola i release použily tento izolovaný pracovní strom.

## Návrat

Standardní `pnpm rollback:production -- 3e6691c0967e5470842a9199f10777e80394ba0a`.
Migrace je aditivní; při návratu obrazu ponechat návrhy recenzí i audit v DB.
Neprovádět destruktivní down migraci. Zálohy a X5 retence se nemění.

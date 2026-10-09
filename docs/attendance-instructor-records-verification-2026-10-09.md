# Ověření docházky, výkazů a klientské navigace 2026-10-09

Stav: nasazeno do produkce 2026-10-09.
Živá společná revize web/API/worker: `09415a2dd1168c2df67b1cde73b6308715128ec3`.
Izolovaná větev: `codex/attendance-instructor-records`.
Výchozí revize: `1258f1f207ef19b5977bacc733e6d1df8ed6ecae`;
navazuje na aplikační bezpečnostní release `1923ef305c`.
Původní pracovní kopie s nesouvisejícími změnami zůstala nedotčená.

## Hotové chování

- Po skončení termínu administrátor označí nepřítomné a jednou akcí
  potvrdí dosud rezervované účastníky a provozní výkaz instruktora.
  Rezervace sama nezakládá účast ani platbu. Dosavadní pravidla poplatků platí.
- Výkaz obsahuje skutečného instruktora, datum, lekci, začátek/konec,
  odučené minuty a ručně zadanou odměnu. Měsíční součet, CSV a tisk označují
  chybějící výkazy či odměny. Jde o provozní podklad, nikoli kompletní DPP agendu.
- Verze, token seznamu a transakční zámky odmítnou zastaralé potvrzení;
  shodný retry nevytvoří další výkaz, audit ani poplatek. Snapshot jednotlivých
  stavů a přesných časů rezervací zachytí i pozdější změnu docházky bez změny počtu.
- Body Sculpt se přejmenuje na **Formuj břicho a hýždě** se zachováním
  ID, slugu, rezervací, ceny a kapacity. Nový výchozí plakát má opravený nadpis;
  vlastní uploady se nepřepisují.
- Spodní klientská lišta obsahuje Rozvrh, Rezervace, Novinky, Zprávy a Profil.
  Vybraná sekce se zachová při přihlášení a klávesnicový fokus přejde na její nadpis.

## Výsledky kontrol

| Kontrola | Výsledek |
|---|---|
| Lint, typy a produkční sestavení všech workspace projektů | prošly |
| Jednotkové testy web/API/doména/worker | 180 / 123 / 7 / 3 prošlo |
| Celá integrační brána na izolovaném PostgreSQL 18.6 | 70/70, 9 souborů |
| OpenAPI, generované kontrakty, analytika, kostra a Keycloak téma | prošly |
| Změněný seznam při rozpracovaném formuláři, reload, potvrzení a chyba API | lokálně ověřeno |
| Navigace, fokus a šířka 360 px bez přetečení stránky | lokálně ověřeno |
| Tisk měsíce včetně varování neúplnosti | lokálně ověřeno |

Databázové kontroly pokrývají atomicitu, rollback při selhání auditu,
souběh změn, idempotenci, poplatky, doprovod, záskok a měsíční hranice/DST.
Browser kontrola používala syntetická lokální data, nikoli reálné rezervace.
Poslední databázový běh používal vlastní dočasný tmpfs kontejner, protože
lokální Docker Desktop měl zaplněný disk. Sdílené obrazy, volumes a jiné projekty
se nečistily ani neměnily.

Chroma MCP funguje pro kanonický repozitář, izolovaná pracovní kopie však
není v seznamu spravovaných kořenů. MCP reindex skončil chybou a povolený CLI
fallback odmítl kořen jako nevybraný projekt aplikace. Jeho index tedy zatím
neobsahuje tyto změny; kanonický checkout ani sdílená služba se kvůli tomu neměnily.

Opravený plakát: `apps/web/public/images/studio-balance/lessons/formuj-bricho-a-hyzde.png`.
Úprava zdrojového plakátu nástrojem imagegen: změnit pouze velký nadpis na
„FORMUJ / BŘICHO / A HÝŽDĚ“, zachovat fotografii, osobu, kompozici a ostatní text.
Výsledek byl vizuálně zkontrolován; dodaný originál zůstává zachovaný.

## Nasazení a návrat

Standardní společný release web/API/worker zahrnul migrace 0029 a 0030,
DB zálohu, skeny obrazů a stávající X5/readiness brány. Produkční čtecí kontrola
potvrdila obě migrace, oprávnění SELECT/INSERT/UPDATE aplikačního účtu k nové
tabulce, nový název a výchozí obrázek. Evidence má po migraci nula záznamů;
historická účast se nedoplnila odhadem. Žádný účet, rezervace, odměna ani
zpráva nebyly při ověřování změněny. Autentizované čtecí ověření administrace
proběhlo po přihlášení vlastníkem. Zbývá skutečný produkční zápis výkazu,
produkční tisk/export a fyzická PWA.

### Autentizovaná administrace

V produkční relaci na `/admin` se načetl Výkaz instruktorů pro říjen 2026:
nula potvrzených výkazů, osm minulých lekcí k ověření a viditelné varování
neúplnosti. Tlačítka CSV a tisku jsou dostupná; jejich produkční výstup se
v této čtecí kontrole nestahoval ani netiskl.

Formulář kruhového tréninku 1. 10. načetl skutečného instruktora, český čas,
60 minut, prázdnou odměnu a informaci o již vyhodnocené docházce. Formulář
lekce Formuj břicho a hýždě 8. 10. načetl pět dosud rezervovaných účastníků,
nezvolené checkboxy nepřítomnosti, instruktorku a možnost společného potvrzení.
Oba formuláře se načetly bez chybové či přihlašovací hlášky. Žádné potvrzovací
tlačítko nebylo odesláno; skutečné účasti ani odměny nebyly změněny.

## Produkční důkazy

Záloha před migrací:
`/srv/x5-production/backups/studio-balance/database-before-09415a2-20261009T105244Z/`.
Custom pg_dump má 490 290 bajtů, soukromá oprávnění a SHA-256 manifest.
pg_restore přečetl TOC i celý archiv do `/dev/null` bez chyby. Úplná obnova
do jiné databáze v tomto release nebyla provedena. Dočasný soubor klientských
přístupových údajů se po záloze odstranil. DB se nadále používá pouze přes
`haproxy.home.cz:5000`.

Trivy receipt:
`/srv/x5-production/archives/studio-balance/image-scans/09415a2dd1168c2df67b1cde73b6308715128ec3/20261009T105844Z-uSEutkzj/verified.json`.
Aktualizovaný scan všech tří obrazů má **0 HIGH / CRITICAL** pro OS i knihovny.

| Služba | Skenovaná a skutečně běžící image ID |
|---|---|
| web | `sha256:23347f671cc9dfcf0b9c56a44dd9fb6f4fa46a36f88418091a4178a14dbc8d6c` |
| API | `sha256:0209cd5e59f2a6aea2fd46fe688517c93aa3018d54732b641899a85054cd96df` |
| worker | `sha256:25f50cdb67d201143cc5f9f0bbc97f1908c01f83797e30b59946ee2d740b9010` |

Kontrola přesné revize i první úspěšné práce workeru prošla. Všechny kontejnery
jsou zdravé, bez restartu a OOM. API log od spuštění nemá error/fatal.
Veřejný HTTPS gate ověřil 200 pro `/`, `/rozvrh`, `/lekce`, `/admin/prihlaseni`
a `/lekce/body-sculpt`, CSP a HSTS, nový název v HTML/API, byte-exact nový PNG,
401 + `no-store` + strukturovanou chybu pro nepřihlášený výkaz a rozvrh bez
veřejného počtu míst. Produkční prohlížeč zobrazil správný nadpis i plakát.

Použité prostředí a CPU shares overlay zůstaly zachované. Nesouvisející aplikace,
globální Docker data-root a sdílené buildery se nekonfigurovaly ani nečistily.
Standardní retence chrání novou verzi a obnovitelné `1923ef305c` a `0d016c0`.
Při skutečném návratu vždy znovu ověřit `verified-releases.json`.

Návrat starší aplikace ponechá tabulku výkazů a audity. Starší webový obraz
ale neobsahuje nový PNG: před jeho aktivací je nutné podmíněně vrátit pouze
výchozí cestu `formuj-bricho-a-hyzde.png` a její alt na původní
`body-sculpt.jpeg` / „Schválený plakát lekce Body Sculpt“. Individuální upload ani název,
ID, rezervace nebo výkazy se tím nemění. Destruktivní návrat databázového
schématu není součástí běžného rollbacku.
Starší API také neobsahuje novou ochranu potvrzené lekce před zrušením
ani zachování uhrazených/prominutých poplatků při opravě docházky. Při rollbacku
pozastavit tyto administrátorské zápisy do návratu opravené verze.

Rozhodnutí a krátký postup pro administrátorku:
[ADR 0026](adr/0026-session-completion-and-instructor-records.md),
[provozní postup](operations.md).

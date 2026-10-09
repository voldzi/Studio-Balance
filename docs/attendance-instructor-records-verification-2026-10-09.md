# Ověření docházky, výkazů a klientské navigace 2026-10-09

Stav: implementováno a lokálně ověřeno; není nasazeno do produkce.
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

Standardní společný release web/API/worker musí zahrnout migrace 0029 a 0030,
DB zálohu, skeny obrazů a stávající X5/readiness brány. Ještě zbývá ověřit
produkční migrace a autentizované cesty, skutečný tisk/export a fyzickou PWA.
Žádné produkční účty, rezervace ani zprávy nebyly v této implementaci změněny.

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

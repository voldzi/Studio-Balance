# ADR 0026: Potvrzení lekce a provozní výkazy instruktorů

Status: Přijato pro implementaci zadavatelem 2026-10-09 podle CD-067.
Produkční aktivace a akceptace vyžadují standardní koordinovaný release.
Datum: 2026-10-09

## Kontext

Potvrzování každého účastníka zvlášť je zatěžující. Rezervace ale dokládá záměr,
nikoli skutečnou účast, zaplacení nebo odvedenou práci instruktora. Provozovatelka
potřebuje jednoduchý měsíční výkaz instruktorů na DPP a ruční odměnu za lekci.
Přesná tabulka odměn není schválena; orientační rozmezí není výpočetní pravidlo.

## Rozhodnutí

- Administrátor s MFA otevře po skončení termínu společné potvrzení lekce.
  Označí nepřítomné a potvrdí ostatní dosud rezervované účastníky. Existující
  stavy docházky se hromadně nepřepisují; oprava má samostatnou auditovanou akci.
- `GET /api/v1/admin/sessions/{id}/completion` vrátí soudržný seznam,
  neprůhledný `rosterToken` a aktuální verzi výkazu. `POST` na stejné cestě
  transakčně uloží docházku, příslušné poplatky, výkaz i audity. Klient předává
  `expectedVersion` (při prvním potvrzení `null`) a token právě načteného seznamu.
- Zámek termínu předchází zámkům rezervací a výkazu. Změněná docházka, rezervace
  nebo verze výkazu způsobí konflikt a nový náhled, nikdy částečné potvrzení.
  Retry stejného již úspěšného obsahu vrátí uložený výsledek bez dalšího výkazu,
  poplatku nebo auditu. Konflikt se nesmí obejít automatickým přepsáním tokenu.
- Pro termín existuje nejvýše jeden aktuální výkaz s verzí, původním plánem,
  snapshoty názvu lekce a skutečného instruktora, skutečným začátkem a koncem,
  účastníky, nullable ruční odměnou a potvrzujícím administrátorem. Historii
  změn uchovává audit s důvodem a předchozí/novou hodnotou.
- Výkaz lze potvrdit až po konci plánované i skutečné lekce; zrušený termín se
  nepotvrdí jako odučený. Záskok a skutečný čas lze uvést bez přepsání rozvrhu.
  Odučený čas je rozdíl skutečných instantů, nikoli předpokládaná hodinová sazba.
- Neúčast má dosavadní poplatek ze snapshotu rezervace. Oprava účasti zachová
  uhrazené či prominuté poplatky. Odhad hodnoty návštěv není příjem ani platba.
  Doprovod se počítá samostatně.
- Odměna `null` znamená k doplnění, explicitní nula je samostatná zadaná hodnota.
  Změna docházky po potvrzení vrací `attendanceChanged`; administrátor znovu
  zkontroluje a potvrdí odměnu. Částka se automaticky nemění.
- `GET /api/v1/admin/instructor-records?month=YYYY-MM` vrací potvrzené výkazy,
  souhrny po instruktorech a nepotvrzené ukončené termíny. Hranice měsíce
  používají `Europe/Prague`, každá hranice se převede samostatně kvůli DST.
  Export a tisk vycházejí z právě vybraného měsíce a označují neúplné odměny.
- Historická účast ani odvedené hodiny se migrací nedoplňují odhadem.
  Existující databáze dostane prázdnou evidenci, administrátor může skutečně
  odučené termíny zpětně potvrdit.

## Hranice a důsledky

Nezavádíme výplatní pásky, odvody, sledování limitů DPP, pracovní smlouvy ani
kompletní evidenci práce mimo lekci. Výkaz je provozní podklad. MPSV rozlišuje
evidenci přítomnosti a evidenci pracovní doby, za niž odpovídá zaměstnavatel;
samotný součet lekcí tuto povinnost nedokládá.
[MPSV: evidence pracovní doby](https://ppropo.mpsv.cz/VIII9Evidencepracovnidoby),
[MPSV: DPP/DPČ, otázka 6](https://mpsv.gov.cz/novela-zakoniku-prace).

Výkazy, odměny a exporty jsou neveřejná osobní/provozní data. Admin guard,
CSRF/same-origin hranice, `private, no-store`, audit a potlačení analytiky
zůstávají. Retence výkazů není součástí cache ani automatického úklidu X5.

Migrace 0029 přidává evidenci; 0030 provádí samostatné kosmetické přejmenování
Body Sculpt dle CD-066 bez změny ID/slug či rezervací a nahradí pouze výchozí
plakát připraveným derivátem s opraveným nadpisem. Originál i vlastní
administrátorské uploady zůstanou zachované. Při rollbacku aplikace
se výkazy ani jejich historie nemažou; starší verze je nečte. Nové UI bez nového
API není kompatibilní, web/API/worker se vydávají jako společná revize.

Akceptace zahrnuje Postgres atomicitu a rollback při chybě auditu, souběh
storna/docházky, retry, stale token/verzi, fee korekce, doprovod, záskok,
měsíční DST, pending odměnu, opravu se stopou, tisk/export a 360px ovládání.
Lokální testy nejsou důkaz produkčního nasazení ani fyzické PWA akceptace.

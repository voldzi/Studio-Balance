# ADR 0014 — Pravidelný rozvrh a průběžné vypisování termínů

Datum: 28. 9. 2026  
Stav: přijato (CD-055)

## Kontext

Dosavadní rozvrh obsahoval jednotlivé datované termíny. Po vyčerpání prvního
horizontu by se nové lekce samy neobjevily. Administrace přitom potřebuje
bezpečně měnit konkrétní termíny, pozastavit řadu a zachovat již vytvořené
rezervace, storna a ceny.

## Rozhodnutí

Týdenní pravidla se ukládají v PostgreSQL odděleně od konkrétních termínů.
Worker každých šest hodin a po startu doplní termíny do tří kalendářních
měsíců od místního data `Europe/Prague`. Generování je chráněné databázovým
zámkem a unikátním párem pravidlo + místní datum. Datum a čas se převádí
databází s pravidly časové zóny, aby změna letního času neposunula místní
začátek lekce. Kolize instruktora nebo místa zastaví generování a vyvolá
provozní chybu.

Ručně vytvořený nebo zrušený termín stejného typu a místního dne blokuje další
automatické vytvoření. Termíny z původního horizontu se nemění; pravidla se
generují od dne po jeho konci. Admin může každé pravidlo pozastavit a obnovit.
Tím se nemění již zveřejněné termíny; jejich hromadné zrušení zůstává
samostatnou auditovanou operací s vyrozuměním rezervovaných klientů.

Rezervace se zatím standardně otevírají 30 dní před začátkem. Změna ceny
pravidla ovlivní nové termíny, nikoli cenové snapshoty dřívějších rezervací.
Při selhání worker nevypisuje neúplný rozvrh a v produkci se restartuje s
chybovým logem; provoz musí sledovat stáří posledního úspěšného běhu a konec
publikovaného horizontu.

## Důsledky

Pravidelný plán je samostatným zdrojem pro budoucí termíny. Úprava jediného
termínu jej nepřepisuje. Datum otevření rezervací je u vytvořeného termínu
uložené a při změně času se přepočítává se stejným předstihem. Přehled
účastníků čte výhradně admin API se stejnou rolí a MFA jako ostatní správa.

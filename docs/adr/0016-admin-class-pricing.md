# ADR 0016: Správa cen celé lekce v administraci

- Status: Accepted
- Datum: 2026-09-28
- Rozhodl: zadavatel aplikace na základě požadavku provozovatelky

## Kontext

Cena je uložena v pravidelném plánu, u konkrétních termínů a jako samostatný
snapshot u potvrzených rezervací. Dosavadní administrace umožňovala upravit
jen cenu jednotlivého termínu. Provozovatelka potřebuje běžný ceník spravovat
bez vývojáře. ADR 0015 vyžadovalo pro další zpětnou změnu rezervace nové
konkrétní rozhodnutí; tento požadavek schvaluje bezpečný způsob, jak takové
rozhodnutí učinit u každé budoucí změny přímo v administraci.

## Rozhodnutí

Administrátor s MFA zvolí typ lekce a novou cenu. Server nejprve ukáže počet
dotčených pravidelných časů, budoucích termínů a aktivních rezervací. Teprve
po samostatném potvrzení se cena atomicky změní v pravidelném plánu a všech
budoucích vypsaných termínech daného typu, včetně zrušených termínů nadále
viditelných v rozvrhu. Minulé termíny zůstávají beze změny.

Potvrzené rezervace si ve výchozím stavu ponechají původní snapshot. Pro jejich
změnu musí administrátor výslovně zaškrtnout samostatnou volbu a potvrdit
konkrétní dopad. Mění se pouze aktivní rezervace budoucích nezrušených termínů;
historické nebo zrušené rezervace se nemění. Existující splatný či uhrazený
storno poplatek zablokuje celý zásah. Každá změna původní a nové ceny dostane
auditní záznam; klient uvidí změnu vlastní rezervace v účtu. Bez volby pro
rezervace se žádné jejich snapshoty ani budoucí storno základ nemění.

Náhled je svázán s přesnou množinou pravidel, termínů a aktivních rezervací.
Pokud se před uložením něco změní, server odmítne zápis a vyžádá nový náhled.
Změna se provede pod databázovým zámkem souběžným s vytvářením rezervací a
generováním termínů. Cena budoucí rezervace se dál bere z aktuálního termínu;
klientský účet u existující rezervace zobrazuje její vlastní snapshot.

## Důsledky

ADR 0015 zůstává zdrojem pro jednorázovou změnu Barre. Jeho požadavek na nové
konkrétní rozhodnutí pro každou další změnu naplňuje výslovný, auditovaný úkon
administrátora po zobrazení dopadu. Samotné zavedení ovládání nemění nynější
tři rezervace Balance Flow ani neblokuje Barre; o obou věcech se zadavatelka
teprve vyjádří.

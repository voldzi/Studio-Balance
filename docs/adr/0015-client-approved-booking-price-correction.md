# ADR 0015: Výslovně schválená úprava ceny existující rezervace

- Status: Accepted
- Datum: 2026-09-28
- Rozhodl: zadavatelka Studio Balance, zprostředkoval zadavatel aplikace

## Kontext

Rezervace normálně ukládá cenový snapshot, aby pozdější změna ceníku
nezměnila již potvrzenou cenu ani případný storno poplatek. Po nastavení
budoucího Barre na 270 Kč zadavatelka výslovně požádala, aby se tato cena
promítla i do již potvrzených rezervací budoucího Barre. Současně snížila
cenu Balance Flow na 160 Kč, ale u této lekce zpětnou změnu rezervací
nepožadovala.

## Rozhodnutí

Jednorázová migrace pod databázovým zámkem upraví pouze aktivní rezervace
budoucího Barre na snapshot 270 Kč. Zachová jejich identifikátory, termíny,
stav a historii; pro každou změnu uloží předchozí a novou cenu do auditu
a oznámení v klientském účtu. Pokud by u některé dotčené rezervace už
existoval splatný nebo uhrazený storno poplatek, migrace se celá zastaví.
Historické a zrušené rezervace se nemění.

Balance Flow bude pro budoucí termíny a další generování za 160 Kč.
Stejná zobrazovaná cena se nastaví i u budoucích zrušených termínů, které
zůstávají ve veřejném přehledu viditelné; jejich zrušený stav se nemění.
Již potvrzené rezervace Balance Flow ponechají původní cenový snapshot.
Obecné pravidlo neměnnosti snapshotů zůstává v platnosti mimo tento
výslovně vymezený zásah.

## Důsledky

Storno poplatek za dotčenou aktivní rezervaci Barre se po změně případně
odvodí z nového snapshotu 270 Kč. Změna ceny nezakládá novou rezervaci
a neposílá zavádějící oznámení o změně času. Další podobná zpětná změna
vyžaduje nové konkrétní rozhodnutí.

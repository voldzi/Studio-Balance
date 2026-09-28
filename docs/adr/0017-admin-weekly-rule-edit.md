# ADR 0017: Úprava pravidelného rozvrhu správcem

- Status: Accepted
- Datum: 2026-09-28
- Rozhodl: zadavatel aplikace

## Kontext

Pravidelný plán se automaticky promítá do datovaných termínů. Pouhé přepsání
pravidla by ponechalo už vypsané termíny, kapacity a rezervace v jiném stavu.
Provozovatelka potřebuje spravovat běžné změny bez vývojáře.

## Rozhodnutí

Správce s rolí a MFA upravuje jeden pravidelný čas. Náhled ukáže počet
odpovídajících budoucích termínů a rezervací. Potvrzení vyžaduje stejný stav
dat; změna pravidla a termínů proběhne v jedné transakci, se zámkem proti
současné rezervaci a generátoru. Odpovídající termín má dosavadní den a čas
pravidla; samostatně změněný termín zůstává výjimkou. Nový místní čas se
počítá v Europe/Prague pro každý konkrétní den, včetně změn letního času.

Při přesunu se zachovají identita a cena rezervace, přepočítá se storno
hranice a připomínky. Klient obdrží zprávu v účtu a provozní e-mail.
Snížení kapacity pod počet rezervací, kolize instruktora či studia, duplicita
typu lekce v cílovém dni a přesun do minulosti se odmítnou atomicky.
Zrušené termíny ani historické rezervace se nemění. Nová cena celé lekce má
samostatný výslovný postup dle ADR 0016.

## Důsledky

Již jednotlivě změněné budoucí termíny je nutné posoudit zvlášť v seznamu
termínů. Vypnutí vytváření dalších termínů zůstává samostatná akce a
neruší již vypsané rezervace.

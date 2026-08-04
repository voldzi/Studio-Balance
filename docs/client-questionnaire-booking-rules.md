# Dotaz zadavateli k rezervačním pravidlům

## Stav

Připravený návrh k odeslání ve chvíli, kdy se začne implementovat rezervační
workflow. Do té doby nejsou doporučené odpovědi schváleným chováním.

## Otázky

1. **Kdy se rezervace otevírá a zavírá?**
   Kolik dní před lekcí se klient smí poprvé rezervovat a kolik minut před
   začátkem se online rezervace uzavře? Doporučení: otevření 30 dní předem,
   uzavření 30 minut před začátkem, s možností změny u konkrétní lekce.

2. **Lze rezervaci zrušit po začátku lekce?**
   Doporučení: klient ji po začátku už nezruší; stav upraví pouze administrátor
   jako účast, neúčast nebo opravu s důvodem.

3. **Co se stane, když studio významně změní čas nebo místo?**
   Má klient získat nové bezplatné storno okno bez ohledu na původní 24hodinovou
   hranici? Doporučení: ano, u významné změny administrátor výslovně aktivuje
   bezplatné storno do stanoveného termínu.

4. **Kdy klient potvrzuje storno podmínky?**
   Při každé rezervaci, nebo jen při první rezervaci a po vydání nové verze
   podmínek? Doporučení: při první rezervaci a po každé změně verze; souhrn se
   zobrazuje vždy.

5. **Která připomenutí si klient může vypnout?**
   Zadání navrhuje 24 hodin, 2 hodiny a 30 minut před lekcí. Doporučení: klient
   může vypnout běžná připomenutí, ale potvrzení a změna/zrušení studiem se
   vždy odešlou e-mailem.

6. **Blokuje nezaplacený storno poplatek další rezervace?**
   Doporučení pro první verzi: neblokuje, pouze se zobrazuje klientovi a
   administraci jako částka k vyřešení ve studiu.

7. **Má administrace evidovat způsob uhrazení storno poplatku?**
   Má obsahovat volbu „hotově / terminálem“, nebo jen obecný stav „uhrazeno“?
   Doporučení: první verze eviduje stav, datum, administrátora a volitelný
   způsob úhrady; nejde o online platební transakci.

8. **Smí administrátor rezervovat nového klienta bez existujícího účtu?**
   Pokud ano, jaká minimální data získá a jak klient později převezme účet?
   Doporučení: administrátor může založit pozvánku s jménem a kontaktem;
   rezervace se spojí s účtem až po bezpečném potvrzení e-mailu.

## Požadovaný způsob odpovědi

U každého bodu stačí potvrdit doporučení nebo napsat vlastní pravidlo. Odpovědi
se následně promítnou do `requirements.md`, API kontraktu, testů a případného
nového ADR před implementací příslušného workflow.

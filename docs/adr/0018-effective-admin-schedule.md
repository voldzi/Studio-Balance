# ADR 0018: Správa rozvrhu s účinností

- Status: Accepted
- Datum: 2026-10-01
- Rozhodl: zadavatel aplikace (CD-061)

Rozšiřuje ADR 0017; nová správa používá časově omezené verze a nahrazuje
postup bez data účinnosti v hlavní administraci.

## Rozhodnutí

Pravidelný čas má navazující verze: `generate_from`, `generate_until` (včetně)
a `predecessor_id`. Změna uzavře původní verzi den před účinností a vytvoří
navazující. Omezené období vytvoří i následnou obnovu původního nastavení.
Zámky termínů, pravidel, rezervací a poplatků serializují změnu s rezervacemi
a generátorem. Náhled hash váže vstup i aktuální data. Souběh vyžaduje nový
náhled; celá změna se vrátí při kolizi nebo nedostatečné kapacitě.

Nové rezervace lze uzavřít příznakem `booking_paused` bez rušení klientů.
Samostatná operace cancel ukončí termíny a rezervace bez nových poplatků;
generátor vytváří zrušené výskyty, aby je automaticky znovu neotevíral.
Open obnoví generování, zrušené datované termíny jen s výslovnou volbou.
Historické a zrušené rezervace zůstávají. Individuálně přesunuté výjimky
zůstávají a jejich vazba zabrání vytvoření duplicitního výskytu.

Významná změna typu, času, délky, místa či instruktora poskytuje nejméně
24 hodin od změny pro bezplatné odmítnutí, nejdéle do začátku lekce;
zachová se případné delší původní okno. Kapacita sama oznámení neposílá.
Přecenění aktivních rezervací je výslovné a chrání aktivní/uhrazené poplatky.

## Důsledky a rollback

Starý worker ignoruje ukončení verze a příznaky dostupnosti. Po prvním vytvoření
verzí se proto nesmí samostatně vrátit worker před ADR 0018. Pro takový rollback
zastavit worker, ponechat databázi a dodat dopřednou opravu; žádný automatický
restore databáze. Samotná migrace struktury před vytvořením verzí je aditivní
kromě odstranění široké unikátnosti typu a dne; její náhradu v platném období
vynucuje transakční plán i generátor.

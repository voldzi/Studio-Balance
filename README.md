# Studio Balance

Studio Balance je připravované jednotné digitální řešení pro boutique pohybové
studio. Zahrne responzivní veřejný web, klientský účet s rezervacemi a webovou
administraci nad jedním backendem a jednou databází.
Primárními uživateli jsou návštěvníci a klienti studia, provozovatelka a hlavní
administrátor. Vlastníkem produktu je Studio Balance; jmenovitý produktový
vlastník a technický správce musí být před zahájením implementace potvrzeni.

## Stav projektu

Projekt je ve fázi přípravy a analýzy. Technologický stack je schválený,
repozitář ale zatím neobsahuje aplikační scaffold. Obsahuje závazné podklady zadavatele,
výchozí pravidla pro vývoj a první sadu aktivní produktové, technické a
provozní dokumentace.

## Hlavní schopnosti

- veřejný responzivní web s lekcemi, rozvrhem, ceníkem, galerií a kontaktem;
- vlastní účet klienta a rezervace bez online plateb;
- interně řízená kapacita bez veřejného počtu míst a bez čekací listiny;
- automatické vyhodnocení storna na hranici 24 hodin v `Europe/Prague`;
- responzivní klientský účet použitelný od mobilního telefonu po desktop;
- administrace rozvrhu, rezervací, docházky, klientů a obsahu;
- jeden sdílený backend, datový model a auditní stopa.

## Závazné hranice první verze

První verze neobsahuje online platby, platební karty, Apple Pay, Google Pay,
e-shop, online permanentky, čekací listinu, číselný počet volných míst ani SMS.
Tyto hranice nelze změnit tichým technickým rozhodnutím.

## Zdroj pravdy

Pořadí autority je popsáno v [evidenci podkladů](docs/source-register.md):

1. `docs/client-decisions.md` obsahuje závazné pozdější změny zadavatele;
2. `docs/01 Zadání/STUDIO_BALANCE_ZADANI_PRO_VYVOJ.md` je původní brief;
3. aktivní dokumentace v `docs/` převádí oba zdroje do vývojového tvaru;
4. `openapi/openapi.json` je závazný strojový kontrakt API v rozsahu, který už
   specifikace pokrývá;
5. tři dokumenty Word a obrazové podklady jsou doplňkové reference.

Při rozporu platí výše postavený zdroj. Změna závazného zadání musí být
výslovně schválena a promítnuta do příslušných dokumentů a ADR.

## Technologie

TypeScript monorepo s Next.js, NestJS/Fastify, workerem, PostgreSQL 18 a `pnpm`
je schválený. Poskytovatelé e-mailu a monitoringu zatím nejsou uzavření.
Architektonické rozhodnutí je v
[ADR 0003](docs/adr/0003-web-only-application-stack.md).
Identita používá Keycloak/OIDC podle
[ADR 0004](docs/adr/0004-keycloak-identity.md).

Schválená infrastrukturní topologie je v
[ADR 0002](docs/adr/0002-deployment-and-storage-topology.md):

- kanonický GitHub repozitář: `git@github.com:voldzi/Studio-Balance.git`;
- veřejná adresa: `https://studiobalance.zeleznalady.cz`;
- internetový vstup: Nginx na `dmz.home.cz`;
- produkční aplikace poběží jako Docker kontejnery na `docker.home.cz`;
- produkční PostgreSQL je dostupný výhradně přes
  `haproxy.home.cz:5000`; Patroni potvrdil PostgreSQL 18.4;
- produkční obsahová média budou po provozním zpevnění používat existující
  S3-kompatibilní úložiště na `docker.home.cz`; doporučená varianta je
  samostatná Studio Balance brána, bucket a credentials nad sdíleným SeaweedFS;
- lokální závislosti poběží v Docker Desktop, odděleně od produkčních dat.

Aktuální inventura, využitelné služby a podmínky produkční připravenosti jsou v
[posouzení infrastruktury](docs/infrastructure-assessment.md).

## Lokální práce

Scaffold aplikace ještě nevznikl. Lze ověřit kostru repozitáře a
strojový kontrakt:

```bash
bash scripts/validate-skeleton.sh
python3 -m json.tool openapi/openapi.json >/dev/null
```

Při vytvoření scaffoldu musí být tato sekce nahrazena přesnými příkazy pro
instalaci, vývoj, build, testy, lint a typovou kontrolu. Lokální databáze a další potřebné
služby budou definovány v Docker Compose pro Docker Desktop; lokální vývoj se
nesmí připojovat k produkční databázi.

## Dokumentace

Aktivní sada začíná v [docs/README.md](docs/README.md). Základní orientace:

- [požadavky a pravidla rozsahu](docs/requirements.md),
- [produkt a UX/UI](docs/product-design.md),
- [architektura](docs/architecture.md),
- [API](docs/api.md),
- [bezpečnost a soukromí](docs/security.md),
- [testovací strategie](docs/testing.md),
- [závazná pozdější rozhodnutí](docs/client-decisions.md),
- [dotaz k rezervačním pravidlům](docs/client-questionnaire-booking-rules.md),
- [posouzení infrastruktury](docs/infrastructure-assessment.md),
- [plán realizace](docs/delivery-plan.md),
- [otevřená rozhodnutí](docs/open-questions.md).

## Vývojový postup

Vývoj nezačíná implementací obrazovek. Nejprve je nutné uzavřít blokující
rozhodnutí, převzít produkční logo a fotografie a schválit klíčové prototypy.
Každá změna musí současně udržet aktuální požadavky, API kontrakt, testy,
bezpečnostní pravidla a provozní dokumentaci.

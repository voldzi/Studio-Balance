# Studio Balance

Studio Balance je připravované jednotné digitální řešení pro boutique pohybové
studio. Zahrne responzivní veřejný web, klientský účet s rezervacemi a webovou
administraci nad jedním backendem a jednou databází.
Primárními uživateli jsou návštěvníci a klienti studia, provozovatelka a hlavní
administrátor. Vlastníkem produktu je Studio Balance; jmenovitý produktový
vlastník a technický správce musí být před zahájením implementace potvrzeni.

## Stav projektu

Projekt přešel z analýzy do vývoje. Repozitář obsahuje první aplikační základ:
Next.js web, NestJS/Fastify API, worker, sdílené balíčky, lokální PostgreSQL 18
a Keycloak. Rezervační pravidla se začnou implementovat až po uzavření
připraveného dotazu zadavateli.

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
První spustitelný platformní základ popisuje
[ADR 0005](docs/adr/0005-initial-platform-baseline.md) a izolované ověření na
cílovém Docker hostiteli [ADR 0006](docs/adr/0006-isolated-preview-deployment.md).

Schválená infrastrukturní topologie je v
[ADR 0002](docs/adr/0002-deployment-and-storage-topology.md):

- kanonický GitHub repozitář: `git@github.com:voldzi/Studio-Balance.git`;
- veřejná adresa: `https://studio-balance.cz`;
- přihlášení: `https://login.studio-balance.cz`;
- internetový vstup: Nginx na `dmz.home.cz`;
- produkční aplikace poběží jako Docker kontejnery na `docker.home.cz`;
- produkční PostgreSQL je dostupný výhradně přes
  `haproxy.home.cz:5000`; Patroni potvrdil PostgreSQL 18.4;
- produkční obsahová média používají SeaweedFS na `storage.home.cz:8333`,
  vlastní bucket `studio-balance-media` a omezený účet podle ADR 0012;
- lokální závislosti poběží v Docker Desktop, odděleně od produkčních dat.

Aktuální inventura, využitelné služby a podmínky produkční připravenosti jsou v
[posouzení infrastruktury](docs/infrastructure-assessment.md).

## Lokální práce

Požadavky: Node.js 24–26, pnpm 11 a Docker Desktop. První spuštění:

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm dev
```

Web běží na `http://localhost:3000`, API na `http://localhost:3001` a lokální
Keycloak na `http://localhost:8081`. Vývojové hodnoty v `.env.example` a realm
importu jsou veřejné lokální fixtures, nikoli produkční credentials.

Hlavní kontroly:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:repo
pnpm check
```

Jednotlivé procesy lze spustit přes `pnpm dev:web`, `pnpm dev:api` a
`pnpm dev:worker`. Lokální vývoj se nikdy nesmí připojovat k produkční databázi
nebo produkčnímu Keycloak realmu.

## Nasazení na Docker hostiteli

Přesný čistý Git commit lze nasadit příkazem `pnpm deploy:preview -- <sha>`.
Na `docker.home.cz` vznikne izolovaný Compose projekt s webem na portu 3280,
API na 4280 a vlastním nepublikovaným PostgreSQL 18 volume. Jde pouze o interní
náhled bez DMZ, produkčního Keycloaku, HAProxy databáze a S3. Ověření a rollback
popisuje [provozní dokumentace](docs/operations.md).

Nginx publikaci tohoto preview popisuje
[ADR 0007](docs/adr/0007-dmz-nginx-publication.md). Veřejná adresa nyní přes
DMZ směruje na samostatný produkční stack na portech 3281/4281 s produkčním
Keycloakem a PostgreSQL přes HAProxy; izolovaný preview stack zůstává neveřejný.
Přesný čistý produkční commit se nasadí pomocí
`pnpm deploy:production -- <sha>` a předchozí kompatibilní image se obnoví přes
`pnpm rollback:production -- <previous-sha>`. S3 uploady jsou připojené; e-mail a
zbývající release gates se nesmí vydávat za dokončené. Přesné kontroly a
rollback popisuje [provozní dokumentace](docs/operations.md).

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

Vývoj probíhá po vertikálních řezech z `docs/delivery-plan.md`. Neověřené
fotografie ani logo se v produkčním povrchu nepoužívají a otevřená rezervační
pravidla se neodhadují. Každá změna musí současně udržet aktuální požadavky,
API kontrakt, testy, bezpečnostní pravidla a provozní dokumentaci.

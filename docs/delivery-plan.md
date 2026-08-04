# Plán realizace

## Princip etapizace

Projekt se realizuje po ověřitelných vertikálních řezech. Každá etapa má vstupní
podmínky, konkrétní výstupy a exit gate. Veřejný web, klientský účet a
administrace používají jedno společné API a pravidla.

## Fáze 0 – rozhodnutí a obsah

Výstupy:

- uzavřené blokující položky `open-questions.md`;
- schválená architektura a technologický ADR;
- potvrzené připojovací a release parametry pro Docker na `docker.home.cz` a
  PostgreSQL přes `haproxy.home.cz:5000`;
- potvrzený produkční S3 bucket/gateway, credentials, kapacita, záloha a
  restore test;
- implementovaný Keycloak realm/clients, issuer přes DMZ, email verification,
  admin MFA, lokální dev realm a provozní restore/recovery;
- produkční logo a prvotní fotografické/content balíčky;
- potvrzené ceny, kontakty, storno znění a právní odpovědnosti;
- vlastnictví domény, identity, e-mailu a infrastrukturních účtů;
- prioritizovaný backlog s návazností na ID z `requirements.md`.

Exit gate: žádná otevřená P0 otázka, která mění aplikační scaffold, datový model,
rezervační pravidla nebo klíčové obrazovky.

## Fáze 1 – design systém a ověřený prototyp

Výstupy:

- potvrzené barvy, typografie, spacing, radius, elevation a motion tokeny;
- desktop/mobil homepage, rozvrh, detail typu, detail termínu a rezervační tok;
- responzivní klientský přehled/Rozvrh/Rezervace a hlavní admin workflow;
- loading, empty, full, closed, cancelled, validation a system-error stavy;
- přístupnostní a responzivní anotace;
- obsahová matice assetů a textů.

Exit gate: provozovatelka schválí klíčové obrazovky a explicitně potvrdí, že se
nikde neukazuje počet míst, platba ani waitlist.

## Fáze 2 – aplikační základ, backend a administrace

Pořadí vertikálních řezů:

1. health/readiness, konfigurace, databáze, migrace, request ID a audit základ;
2. identity, role a oddělené administrativní přihlášení;
3. typy lekcí, instruktoři a obsahová média;
4. jednorázové/opakované termíny, výjimky a čas `Europe/Prague`;
5. transakční rezervace, kapacita, idempotence a klientský přehled;
6. včasné/pozdní storno, docházka, fee a audit oprav;
7. e-mailové a provozní joby, retry a zneplatnění starých reminderů;
8. CMS obsah, exporty a provozní dashboard.

Exit gate: API kontrakt, migrace, integrační testy a administrativní akceptace
pro každý řez; ověřena obnova databáze.

## Fáze 3 – veřejný web a klientský účet

Výstupy:

- všechny veřejné routes a SEO metadata;
- veřejný rozvrh bez přihlášení;
- přihlášení/registrace v kontextu vybraného termínu;
- rezervace, storno, nadcházející rezervace a historie;
- responzivní, přístupné a vizuálně schválené rozhraní;
- analytika jen v rozsahu schváleného consentu.

Exit gate: WEB/RES akceptační scénáře, přístupnostní smoke, podporované browsery,
výkonové cíle a žádný zakázaný prvek v DOM/API.

## Fáze 4 – systémová akceptace

Povinné sady:

- hranice přesně 24 hodin včetně DST;
- souběžná rezervace posledního místa a dvojklik;
- změna/zrušení termínu a zastavení starých notifikací;
- autorizace cizí rezervace a administrativních endpointů;
- export, smazání/anonymizace a auditní stopa;
- záloha/obnova, výpadek e-mailu a media delivery vrstvy;
- responzivita, přístupnost, performance smoke a vizuální regrese;
- obsahová a právní kontrola produkčních dat.

Exit gate: žádná otevřená kritická/vysoká vada, všechny P0 acceptance testy
prokazatelně prošly a známá provozní rizika mají runbook.

## Fáze 5 – spuštění a předání

Výstupy:

- produkční doména, TLS, prostředí a migrace počátečního obsahu;
- Docker image registry a řízené nasazení/rollback na `docker.home.cz`;
- Nginx route a TLS publikace `studiobalance.zeleznalady.cz` přes
  `dmz.home.cz`;
- produkční DB připojení přes HAProxy a ověřený zákaz přímých DB node adres;
- monitoring, alerty, zálohy a ověřený rollback;
- vyhrazená S3 media gateway/bucket a ověřená obnova objektů;
- publikace webové aplikace;
- školení provozovatelky a administrativní příručka;
- seznam účtů, služeb, licencí a nákladů;
- zdrojové kódy, API, migrace, testy a dokumentace;
- plán záruční podpory a exit/export dat.

## Průběžné release gates

Každý merge musí projít buildem, lintem, typovou kontrolou, relevantními testy,
kontrolou kostry, OpenAPI validací a secret/dependency scanem. Konkrétní příkazy
se doplní při vytvoření scaffoldu. Vývojový stav nelze označit jako hotový, pokud
chybí související dokumentace nebo nebyla spuštěna relevantní kontrola.

## Hlavní rizika

| Riziko | Dopad | Mitigace |
| --- | --- | --- |
| nejasná finální značka a fotografie | přepracování designu, neprodukční obsah | asset gate ve fázi 0/1 |
| souběh rezervací | přeplnění lekce | DB transakce, unikátní constraint a concurrency test |
| chyby času/DST | nesprávné storno a reminder | IANA zóna, UTC instants, hraniční testy |
| dvě implementace pravidel | rozdílný klientský web/admin | společné API a doménová služba |
| nedoručené změny lekce | provozní a reputační dopad | fronta, retry, stav doručení, alert a povinný e-mail |
| nejasná retence/právní texty | privacy riziko | uzavřít OQ-021 až OQ-024 před produkcí |
| příliš široká první verze | zpoždění | neměnit P2 na P0 bez explicitní prioritizace |
| zaplněný produkční Docker host | selhání deploymentu nebo zápisu médií | před rolloutem bezpečně uvolnit/rozšířit kapacitu a nastavit alerty |
| sdílení S3 tenantů | únik nebo smazání cizích médií | samostatný bucket, credentials, gateway a restore test |

# ADR 0027 — Bezpečná diagnostika zneplatnění relací

Status: accepted, 2026-10-09 (CD-069).

## Context

Relace uchovávala čas zneplatnění bez důvodu. Ten nestačí k rozlišení
odhlášení, vypršení, neplatné identity a chyby obnovovacího údaje. Přítomnost
90denní cookie sama nepotvrzuje použitelnost serverové relace.

## Decision

U prvního zneplatnění uchovat pevně vymezený důvod a diagnostické ID požadavku.
Strukturovaný serverový záznam používá netajné UUID relace a obvyklá provozní
pole. Neobsahuje token, hash tokenu, cookie, e-mail, IP ani volný text chyby
poskytovatele. Starší relace mají důvod neznámý.

Rozlišit odhlášení, 90denní maximum, 30denní neaktivitu, chybějící/poškozený
obnovovací údaj, odmítnutí obnovy, neplatnou identitu, změnu subjektu a ztrátu
administrátorské role. Zachovat první důvod při opakování i souběhu. Dočasná
nedostupnost poskytovatele je samostatná chyba 503 bez zneplatnění relace.

Web může u přihlášení zaznamenat přítomnost jednotlivých aplikačních cookies
a volbu zapamatování. Jejich nepřítomnost neurčuje příčinu ztráty. Diagnostika
nepatří do veřejné analytiky a nevytváří trvalý otisk prohlížeče.

## Consequences

Nemění se oprávnění, MFA, bezpečné odmítnutí operace při výpadku ani pravidla
platnosti relací. Aditivní migrace nebrání návratu starší aplikace, která nové
sloupce nevyplní. Provozní důvody zůstávají pod stejnou ochranou jako relace;
nevzniká nové veřejné diagnostické API ani automatické mazání auditní evidence.

## Validation

Ověřit všechny důvody, opakování/souběh, rozlišení dočasné nedostupnosti,
uchování rotovaného tokenu při výpadku JWKS a zákaz citlivých hodnot v logu.

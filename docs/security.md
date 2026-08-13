# Bezpečnost a soukromí

## Status a cíle

Identita používá Keycloak 26.1.5, realm `studio-balance` a oddělené web/admin
OIDC policies podle ADR 0004. Implementovaný webový řez používá Authorization
Code + PKCE, jednorázový state/nonce cookie a osmihodinovou `HttpOnly` relaci
`sb_session`, podepsanou pouze serverovým `SESSION_SECRET`. API ověřuje tuto
relaci pro `GET /api/v1/me`. Registrace doplněná o klientský telefon, správa
profilu, admin MFA enforcement a rezervační autorizace jsou navazující řezy.
Systém zpracovává
kontaktní údaje, rezervace, docházku a administrativní fee, ale nikdy platební
karty nebo online platební tokeny.

Hlavní cíle:

- klient přistupuje pouze ke svým datům;
- privilegovaná změna je autorizovaná a auditovaná;
- booking pravidla nelze obejít klientským UI nebo opakovaným requestem;
- uniklý log, chyba nebo export nezpůsobí zbytečný únik osobních údajů;
- provozovatelka může bezpečně vyřídit export, opravu a zrušení účtu.

## Klasifikace dat

| Třída | Příklady | Zacházení |
| --- | --- | --- |
| veřejná | popisy lekcí, publikované profily, ceník, rozvrh bez klientů | cache/CDN možné |
| interní | kapacita, interní poznámky, auditní metadata, delivery stav | pouze oprávněné role |
| osobní | jméno, e-mail, telefon, rezervace, docházka, souhlasy | minimalizace, TLS, RBAC, retence |
| tajná | password hash, session/token, provider credentials | secret store, nikdy log/export |

Zdravotní údaje se v první verzi cíleně nesbírají. Datum narození ani nouzový
kontakt nejsou požadovány. Volná interní poznámka nesmí sloužit jako skryté
úložiště nadbytečných citlivých informací.

## Autentizace

- aplikace hesla neukládá; Keycloak je chrání
  moderním adaptivním hashem a schválenou password policy;
- login a reset jsou rate-limited, monitorované a odolné proti enumeraci účtů;
- reset token je náhodný, jednorázový, krátkodobý a v úložišti chráněný;
- změna hesla a zrušení účtu vyžadují čerstvé/zesílené ověření;
- webová session je `HttpOnly`, `Secure`, vhodné `SameSite`, rotovaná po loginu;
- OIDC Authorization Code flow používá PKCE; tokeny drží serverová BFF/session
  vrstva mimo browser JavaScript;
- admin vstup je oddělený a MFA je povinné pro `admin` i `super_admin`;
- admin Authorization Code žádost vynutí čerstvé Keycloak přihlášení pomocí
  `prompt=login` a `max_age=0`; jmenovitý admin účet se před předáním ověří v
  nové anonymní relaci heslem i TOTP a bez dokončeného testu se nepovažuje za
  aktivovaný;
- klientská registrace nepoužívá e-mailové ověření, dokud není bezpečně provozovaný SMTP sender; booking nadále vyžaduje platnou relaci, vyplněné jméno, příjmení a telefon a přijetí podmínek;
- neaktivní/disabled/deleted účet nemůže vytvořit rezervaci.

## Autorizace

Role: `visitor`, `client`, `admin`, `super_admin`. Kontrola probíhá v doménové
vrstvě/API na každé operaci, nejen v routeru nebo UI.

- klient smí číst/měnit vlastní profil a vlastní rezervace;
- admin spravuje provoz a obsah v rozsahu role;
- super admin spravuje adminy, kritická nastavení, audit a exporty;
- interní kapacita a seznam klientů nejsou veřejné;
- oblíbené typy lekcí jsou vázané na serverový profil aktuálně přihlášeného
  klienta; klient nikdy neposílá ani nevolí cizí `user_id`;
- novinky jsou prostý text; veřejné API vrací pouze publikované položky po čase
  zveřejnění a administrační změny vyžadují admin roli a audit;
- odpověď na cizí objekt neodhalí, zda objekt existuje;
- hromadný export, smazání, změna role a audited correction jsou privilegované
  akce s explicitním důvodem a auditní stopou.

Matice konkrétních akcí vznikne současně s endpointy a je testovaná denial-first
scénáři.

## Secret management

- repository obsahuje jen `.env.example` s prázdnými placeholdery;
- skutečné secret hodnoty jsou v deployment secret manageru a lokálním
  necommitovaném prostředí;
- dev/test/prod používají různé credentials, databáze a sender identity;
- produkční `DATABASE_URL` je secret a smí cílit jen na
  `haproxy.home.cz:5000`, nikdy na přímý databázový uzel;
- produkční S3 access key/secret patří pouze serveru a vyhrazenému Studio
  Balance bucketu; nesdílí se s jiným projektem ani klientským bundlem;
- OIDC web/admin client secrets a session secret patří pouze serveru; produkční
  issuer je přes HTTPS na `login.zeleznalady.cz`;
- lokální Docker Desktop používá pouze lokální credentials a syntetická data;
- rotace credentialu má dokumentovaný postup a nevyžaduje změnu zdrojového kódu;
- logy, error tracking a build artefakty nesmí obsahovat server secret;
- veřejný browser build nikdy nedostane databázové, S3, OIDC client secret nebo
  provider admin credentials.

## TLS a webová ochrana

- pouze HTTPS, bezpečný redirect a HSTS po ověření produkční domény;
- moderní TLS na edge; interní spojení podle zvoleného hostingu;
- bezpečnostní headers: CSP, frame ancestors, nosniff, referrer policy a
  permissions policy dle skutečných funkcí;
- CORS je explicitní allowlist známých webových originů, ne `*` s credentials;
- CSRF ochrana pro cookie-auth změnové operace;
- output encoding a sanitizace povoleného rich textu chrání proti XSS;
- parametrizované dotazy/ORM a žádné skládání SQL z klientského vstupu.

## Validace a doménová integrita

- server validuje tvar, rozsahy, povolená pole a oprávnění;
- kapacita, cutoff, fee a stavové přechody se neberou z klienta;
- cena fee se bere ze serverového snapshotu, ne z requestu;
- klient nikdy neposílá cílový stav jako libovolný string bez doménové operace;
- unikátní aktivní rezervace a fee jsou jištěny DB constraints;
- `Idempotency-Key` má vazbu na aktéra a obsah requestu;
- rate limits jsou přísnější pro auth, booking, password reset, upload a export.

## Uploady a média

- allowlist MIME + signature sniffing, velikost a rozměry;
- náhodné asset IDs, žádná exekuce uploadu, metadata scrub podle potřeby;
- malware/type scan a bezpečné dekódování/transformace;
- originál a odvozené varianty jsou v S3 logicky oddělené; metadata a
  authorization vazby jsou v PostgreSQL a veřejná delivery/cache vrstva nesmí
  zpřístupnit neveřejný originál;
- S3 endpoint a administrační konzole nejsou veřejně publikované, pokud pro to
  neexistuje schválený účel; aplikace používá interní síť a nejmenší oprávnění;
- alt text a licence/consent fotografie jsou obsahová metadata;
- SVG se buď důsledně sanitizuje, nebo obsluhuje jen z důvěryhodného admin
  workflow s bezpečnými response headers.

## Auditní log

Auditovat minimálně:

- login/logout a významná auth selhání;
- změnu role, admin účtu a kritické konfigurace;
- vytvoření/změnu/zrušení termínu a hromadný dopad;
- ruční rezervaci, docházku, no-show a opravu stavu;
- settle/waive/cancel fee včetně důvodu;
- export, žádost o smazání a provedení anonymizace/smazání;
- publikaci/skrytí důležitého obsahu a právního textu.

Událost obsahuje actor ID/role, akci, typ a ID objektu, bezpečný diff, důvod,
čas, request ID a výsledek. Neobsahuje heslo, token ani plný citlivý obsah.
Retence a ochrana proti změně jsou otevřená provozní rozhodnutí.

## Bezpečné chyby a logování

Klient dostane sjednocenou chybu s request ID. Interní detail patří pouze do
chráněného logu. Logovací redakce pokrývá credentials, authorization headers,
cookies, reset tokeny, e-mail provider payloady a volné poznámky. Osobní údaje
se logují jen jako stabilní interní ID nebo bezpečně maskovaná hodnota.

Keycloak theme dědí systémové `keycloak.v2` šablony a upravuje pouze CSS,
lokalizované texty a statické schválené obrazové podklady. Neobsahuje vlastní
JavaScript, formulářové endpointy ani kopii credential logiky. QR kód pro MFA,
OTP, hesla a recovery kódy se nesmí přidat do repozitáře, screenshotů,
analytiky ani provozních logů. Theme assety jsou lokální a neodesílají data na
externí CDN nebo fontovou službu.

## Soukromí a práva subjektu

- sbírat jen data potřebná pro účet a rezervaci;
- evidovat verzi a čas přijetí podmínek;
- marketingový souhlas je samostatný, dobrovolný, odvolatelný a nepředvyplněný;
- analytické cookies se aktivují jen podle skutečného consentu;
- export obsahuje klientova data ve srozumitelném přenosném formátu;
- zrušení účtu respektuje právní retenci: nepotřebná data se smažou nebo
  nevratně anonymizují, povinné záznamy se omezí;
- konkrétní retenční lhůty a správce údajů musí dodat zadavatel/právní podpora;
- foto klienta/recenze se zveřejní jen s doloženým souhlasem; databázový
  constraint i API odmítnou publikaci recenze bez jeho potvrzení;
- recenze jsou prostý text renderovaný s výchozím output encodingem frameworku,
  nikoli administrátorem vložené HTML, a změny publikace se auditují bez uložení
  celého textu do auditních metadat;
- změna recenze a její minimální auditní záznam jsou atomická databázová
  transakce; koncept může odkazovat na neaktivní typ lekce, ale publikace
  vyžaduje existující aktivní typ a neznámý identifikátor API odmítne;
- zdroj reference je volitelný údaj, nikoli podmínka souhlasu nebo publikace,
  a administrační výpis konceptů používá `Cache-Control: private, no-store`.
- proměna před/po se zveřejní jen s doloženým výslovným souhlasem; databáze i
  API odmítnou publikaci bez souhlasu a zvýraznění nepublikovaného záznamu;
- upload proměn přijímá pouze JPG, PNG nebo WebP do 8 MB, skutečný obraz dekóduje,
  odstraní metadata, omezí rozměry a ukládá jen serverem vytvořený WebP;
- veřejně lze načíst jen objekt použitý publikovanou proměnou. S3 credentials
  zůstávají výhradně na serveru a patří samostatnému Studio Balance tenantovi.

## Hrozby vyžadující test

| Hrozba | Kontrola |
| --- | --- |
| převzetí účtu | rate limit, hash, secure session, reset pravidla, MFA admina |
| IDOR na rezervaci | objektová autorizace a 404/403 bez úniku |
| překročení kapacity | transakce, DB constraint/lock, concurrency test |
| double submit/replay | idempotency key a unikátní aktivní booking |
| zneužití admin opravy | role, re-auth podle citlivosti, důvod a audit |
| XSS přes CMS/recenzi | sanitizace rich textu, CSP, output encoding |
| škodlivý upload | signature/type/size scan a neexekuční storage |
| enumeration e-mailů | neutrální reset/register odpovědi a rate limit |
| únik přes observabilitu | redakce a minimální payload |
| supply-chain | lockfile, review dependencies, SCA a pravidelný update |

## Dependency a secret scanning

CI musí po volbě stacku obsahovat pinned install, dependency audit/SCA,
gitleaks nebo ekvivalent, SAST podle stacku a blokování kritických nálezů.
Závislost se nepřidává bez účelu, licence a maintenance kontroly.

## Security release gate

- [ ] threat model a role/action matice jsou aktuální;
- [ ] auth, IDOR, CSRF/XSS, rate limit a reset prošly testy;
- [ ] booking concurrency a idempotence prošly;
- [ ] upload a rich text jsou omezené a testované;
- [ ] žádný secret, karta, payment token nebo nadbytečné PII v repo/logu;
- [ ] privacy texty, retence, export a smazání jsou schválené;
- [ ] admin MFA, email verification, role mapping a recovery prošly testy;
- [ ] záloha i obnova byly bezpečně ověřeny;
- [ ] kritické dependency/secret scan nálezy jsou nulové.

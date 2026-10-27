# Bezpečnost a soukromí

CSP `form-action` dovoluje vlastní původ a pouze původ nakonfigurovaného
OIDC issueru. Prohlížeče tuto direktivu kontrolují také při přesměrování
přihlašovacího formuláře na Keycloak. Povolení se neodvozuje od hlaviček
požadavku ani `returnTo`; nepovoluje externí skripty nebo fetch. HTTP je
přípustné pouze pro lokální loopback identity při vývoji.

## Status a cíle

Identita používá Keycloak 26.1.5, realm `studio-balance` a oddělené web/admin
OIDC policies podle ADR 0004. Implementovaný webový řez používá Authorization
Code + PKCE, jednorázový state/nonce cookie a neprůhlednou `HttpOnly` relaci
`sb_session`. Její hash je uložený na serveru; obnovovací token Keycloaku je
v PostgreSQL šifrovaný AES-256-GCM klíčem odvozeným pomocí HKDF ze serverového
`SESSION_SECRET`. Pokud podepsaný ID token prokáže metodou AMR dokončené OTP,
server tento neměnný důkaz uloží do relace. API ověřuje klientskou relaci pro
`GET /api/v1/me`; privilegované cesty přijmou jen relaci s admin rolí i důkazem
OTP. Oddělená `sb_admin_session` zůstává bezpečnou záložní cestou. Registrace doplněná o klientský telefon, správa
profilu, admin MFA enforcement a rezervační autorizace jsou navazující řezy.
Systém zpracovává
kontaktní údaje, rezervace, docházku a administrativní fee, ale nikdy platební
karty nebo online platební tokeny.

Hlavní cíle:

- klient přistupuje pouze ke svým datům;
- privilegovaná změna je autorizovaná a auditovaná;
- úprava termínu vyžaduje admin roli s MFA, povinný důvod, serverovou kontrolu
  kolize a audit starého i nového času, typu lekce a instruktora;
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
- změna hesla používá Keycloak Application Initiated Action `UPDATE_PASSWORD`,
  vyžaduje čerstvé/zesílené ověření a po dokončení se vrací do profilu; aplikace
  heslo nikdy nepřijímá ani neukládá;
- webová session je neprůhledná, `HttpOnly`, `Secure`, vhodné `SameSite` a po loginu náhodně vydaná; její cookie neobsahuje OIDC token ani roli;
- OIDC Authorization Code flow používá PKCE; tokeny drží serverová BFF/session
  vrstva mimo browser JavaScript;
- MFA je povinné pro `admin` i `super_admin`; takový účet při běžném přihlášení
  dokončí heslo i TOTP a Keycloak vloží metodu `otp` do podepsaného AMR claimu;
- AMR mapper je doplněný explicitními autentizačními referencemi `pwd` a `otp`
  na password/OTP executions standardního webového i odděleného admin flow;
  existence mapperu bez těchto referencí se nepovažuje za důkaz funkčního MFA;
- samostatná admin Authorization Code žádost s `prompt=login` a `max_age=0`
  zůstává záložní cestou, pokud chybí platná MFA-prokázaná webová relace;
  jmenovitý admin účet se před předáním ověří v nové anonymní relaci heslem i
  TOTP a bez dokončeného testu se nepovažuje za aktivovaný;
- profil účtu s rolí `admin` nebo `super_admin` nabízí přímý vstup do správy;
  položka sama oprávnění neuděluje a administrace znovu serverově ověří roli i
  uložený důkaz OTP. Webová relace bez tohoto důkazu se pro správu nikdy
  neuzná, ani kdyby později získala admin roli. MFA-prokázaná relace může na
  soukromém zařízení zůstat použitelná nejvýše 90 dní při aktivitě jednou za
  30 dní;
- bez volby zapamatování je aplikační cookie session-only; klientské přihlášení
  má tuto volbu předem zvolenou s možností vypnutí na sdíleném zařízení,
  administrátorské přihlášení ji má výchozím stavem vypnutou; s volbou má cookie
  maximum 90 dní a server vynucuje 30denní neaktivitu. Před více než 15 minutami
  ověřená relace se při dalším použití obnovovacím tokenem znovu ověří u
  Keycloaku včetně aktuálních rolí; refresh může roli změnit, ale nesmí z
  relace bez OTP vytvořit MFA-prokázanou relaci. Definitivní odmítnutí identity
  relaci zneplatní; dočasná nedostupnost ji zachová, ale aktuální request
  odmítne podle pravidel níže. Keycloak nemá vlastní checkbox „Zapamatovat si mě“, aby
  uživatel viděl jedinou, srozumitelnou volbu;
- klientské i administrátorské odhlášení zruší serverový záznam, odstraní
  šifrovaný refresh token, pokusí se o jeho revokaci u Keycloaku a smaže oba
  aplikační cookies na zařízení;
- klientská registrace nepoužívá e-mailové ověření, dokud není bezpečně provozovaný SMTP sender; konfigurační oprava odstraní i dříve uloženou required action `VERIFY_EMAIL`, ale zachová změnu hesla a registraci TOTP; booking nadále vyžaduje platnou relaci, vyplněné jméno, příjmení a telefon a přijetí podmínek;
- neaktivní/disabled/deleted účet nemůže vytvořit rezervaci.

### Ověřování relace při výpadku identity

Podle CD-069 / ADR 0027 první revokace atomicky uloží vymezený důvod a
request ID spolu s časem zneplatnění. Diagnostický log smí použít netajné UUID
serverového záznamu, nikdy přihlašovací cookie, její hash, credential, e-mail,
IP nebo volný text chyby poskytovatele. Historické relace se zpětně
neklasifikují. Přítomnost cookie u explicitního vstupu na přihlášení je jen
vymezený stav bez hodnoty; absence neurčuje, zda ji odstranil prohlížeč,
odhlášení nebo uživatel.
Diagnostika je interní a není přístupná přes nové veřejné API ani analytiku.

Patnáctiminutový interval ověření účtu a rolí, absolutní limit 90 dní,
30denní limit neaktivity a uložený důkaz OTP se výpadkem neprodlužují.
Rozlišují se následující výsledky obnovy:

- `invalid_grant`, neplatný podpis, issuer, audience, algoritmus nebo jiné
  definitivně neplatné JWT claims relaci zruší. Totéž platí pro chybějící
  identitu, změnu OIDC subjektu a odebranou admin roli u admin relace;
- timeout, síťová chyba, nedostupné JWKS a neúspěšná odpověď token endpointu
  bez `invalid_grant` vrátí HTTP 503 s kódem `IDENTITY_PROVIDER_UNAVAILABLE`.
  Server relaci nerevokuje a nevrátí neověřenou novou identitu ani role.
  Pokud provider už otočil refresh token před výpadkem ověření JWKS, server
  uloží pouze nový šifrovaný refresh token pro další ověřený pokus;
- klientský i admin login nejprve zkusí platnou neprůhlednou relaci. Pokud její
  ověření není dostupné, zobrazí lokální chybu `unavailable`, ponechá cookie a
  nezačne další heslový/OTP flow. Nezávisle platná MFA-prokázaná admin relace
  může dál otevřít administraci, i když ověření jiné webové cookie selže.

Každý identity HTTP request a JWKS fetch má limit 8 sekund. API používá jeden
JWKS resolver na proces, web nejvýše osm resolverů podle issueru a endpointu;
jejich cache a obnova klíčů používají ověřený resolver knihovny `jose`.
Čerstvá relace se čte bez transakčního zámku a dotýká se serverového času
aktivity nejvýše jednou za pět minut. Zastaralé ověření stejné relace sdílí
jeden probíhající pokus; nejvýše 50 různých pokusů v procesu je přijato
současně, další dostanou 503. Rotaci credentialu nadále serializuje DB řádkový
zámek. Tato optimalizace nezvyšuje MFA assurance ani časové limity relace.

### Interní BFF/API protokol a návratové URL

Interní session endpointy jsou serverová hranice a nesmějí být publikované
klientskému browseru. Protokol podpisu v2 používá HMAC-SHA256 ze společného
serverového secretu nad řetězcem
`timestamp:nonce:method:path:hex(SHA-256(rawBody))`. `timestamp` je celé číslo
v milisekundách a `nonce` je náhodných 128 bitů v base64url. Podpis chrání
přesné přenesené bajty těla včetně JSON whitespace, nikoli až parsovaný objekt.
API musí mít zapnuté `rawBody`; bez raw těla požadavek odmítne. Starý podpis
bez těla a nonce nemá kompatibilní fallback. Web i API se proto nasazují a
vracejí společně jako jedna revize.

API přijme časový rozdíl nejvýše 60 sekund a nonce zaznamená až po platném
podpisu. Stejné živé nonce odmítne; při 10 000 živých záznamech vrátí 503 a
žádný živý záznam nevyhodí. Záznam platí do podepsaného času + 60 sekund,
tedy při přípustném budoucím čase nejvýše 120 sekund od přijetí. Jde o
omezenou procesovou ochranu pro jednu API instanci, nikoli trvalý replay
ledger; restart ji vyprázdní. Více API instancí vyžaduje společné atomické
úložiště nonce. Izolace interních endpointů a ochrana společného secretu
zůstávají povinné i s touto ochranou.

`returnTo` a všechny aplikační redirecty přijímají pouze normalizovanou
relativní cestu na přesném nakonfigurovaném veřejném originu. Protokolové
relativní adresy, zpětná lomítka a řídicí/whitespace znaky se odmítnou. OIDC
discovery musí uvádět očekávaný issuer; authorization endpoint je omezen na
jeho veřejný origin a realm cestu, token/JWKS endpointy na schválený veřejný
nebo interní issuer. Neznámý endpoint se nepoužije ani pro redirect, ani pro
přenos client secretu.

## Autorizace

Role: `visitor`, `client`, `admin`, `super_admin`. Kontrola probíhá v doménové
vrstvě/API na každé operaci, nejen v routeru nebo UI.

- klient smí číst/měnit vlastní profil a vlastní rezervace;
- admin spravuje provoz a obsah v rozsahu role;
- super admin spravuje adminy, kritická nastavení, audit a exporty;
- interní kapacita a seznam klientů nejsou veřejné;
- všechny úspěšné i chybové odpovědi pod `/api/v1/me`, `/api/v1/bookings`,
  `/api/v1/admin` a `/api/internal` mají centrálně `Cache-Control: private,
  no-store` a `Vary: Cookie`; přísnější route-specific `no-store` je přípustné.
  To zahrnuje profil, rezervace, oblíbené lekce, administrační fee a seznamy
  klientů. Veřejné podobně pojmenované cesty tímto pravidlem neprivatizujeme;
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
  issuer je přes HTTPS na `login.studio-balance.cz`;
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
- Binární upload přijímá jen JPG, PNG a WebP se skutečnou signaturou; SVG,
  dokumenty a neznámá data se odmítnou před dekódováním. I povolený formát
  musí projít dekódováním, limitem 40 megapixelů, normalizací a odstraněním metadat.
- Nahraná média i chráněné náhledy používají `Cache-Control: private, no-store`.
  Veřejné čtení znovu kontroluje platnou publikovanou vazbu a souhlas. Zrušení
  souhlasu musí odstranit všechny veřejné vazby; starší stažené kopie nelze
  na cizím zařízení zpětně vymazat.

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

## Portréty a skupinová fotografie

Upload `/api/v1/admin/media/studio-image`, editace lektora i týmu vyžadují
stejnou admin roli, MFA a ochranu zápisu jako ostatní administrace. Zpracování
sdílí kontrolu skutečného obrazového formátu, limit 8 MB / 40 milionů pixelů,
orientaci, odstranění metadat a WebP výstup se stávajícím media workflow.
Přiřazení přijímá pouze ID existujícího assetu z prefixu `studio/`, ne URL ani
storage key od klienta. Chrání tím i oddělení od soukromých fotografií proměn.
Veřejné čtení assetu kontroluje aktivního instruktora nebo publikovaný tým;
čerstvý nepřiřazený upload veřejný není. Chráněné náhledy jdou přímo přes admin
media API bez veřejné optimalizační cache. Produkční S3 izolace zůstává platná.

## Připojené S3 (CD-046)

API má pouze `Read`, `Write` a `List` pro `studio-balance-media`; zálohovací
účet pouze `Read` a `List`. Globální infrastrukturní admin zůstává pouze na
storage hostiteli. Provisioning zálohuje statickou konfiguraci a zachovává
ostatní identity. Testy potvrzují odmítnutí cizího bucketu, anonymního čtení
i zápisu zálohovacím účtem. Endpoint `http://storage.home.cz:8333` používá
interní síť bez TLS dle zadavatelem určené adresy; není zveřejněn přes DMZ.
Secrets se přenášejí pouze SSH a ukládají do souborů 0600. Zálohy médií jsou
v neveřejném adresáři 0700 na jiném hostiteli a obsahují soubory 0600.


ADR 0013: API-only dedicated studio-balance-operations service account, realm-management/manage-realm within this realm only. No master credentials in runtime. Registration disabled at identity provider; booking gated transactionally. Admin role, MFA, server session and mutation origin protections apply.

## Docházka a další administrátor (CD-055/056)

Jmenný seznam rezervovaných klientů a jejich kontakt se čtou pouze přes
administrátorské API s rolí a prokázaným MFA; odpověď má `private, no-store`.
Veřejný rozvrh neobsahuje jména ani interní obsazenost. Správce zapisuje
docházku s auditní stopou a u neúčasti vidí před potvrzením cenový snapshot,
z něhož vznikne právě jeden poplatek.

Zřízení Honzova účtu je podle CD-057 odloženo. Pokud se později obnoví,
dostane vlastní účet s rolí `admin`, vlastní heslo a vlastní TOTP.
Sdílení hesla Nicoly nebo vypnutí MFA se nepovoluje. Při zřízení se role
ověří v realmu `studio-balance`, počáteční heslo je dočasné a při prvním
přihlášení se nastaví nové heslo i TOTP. Přístup k osobním údajům rezervací
zůstává jmenovitě auditovaný.

Výjimečná změna ceny aktivní budoucí rezervace Barre podle ADR 0015
uchová audit předchozí i nové ceny a klientské oznámení; bez schválení
konkrétního případu se cenové snapshoty po rezervaci nemění.
Podle ADR 0016 může administrátor s MFA takový konkrétní případ výslovně
schválit až po náhledu dopadu. Výchozí volba snapshoty zachová. Server váže
potvrzení na aktuální množinu rezervací, zapisuje starou i novou cenu a odmítá
zásah do rezervace s aktivním nebo uhrazeným storno poplatkem.

Úprava pravidelného rozvrhu podle ADR 0017 vyžaduje stejné admin MFA.
Náhled ukazuje pouze počty, nikoli osobní údaje. Token náhledu váže změnu
na konkrétní stav pravidla, termínů a počtu rezervací. Uložení kontroluje
kolize a kapacitu v jedné transakci a audit obsahuje důvod i původní a nové
parametry pravidla; osobní údaje klientů do metadat auditu nepatří.

Aktuální audit npm knihoven a jeho omezení popisuje [dependency-audit.md](dependency-audit.md). CI po pinned instalaci spouští `pnpm audit --audit-level=high`; vysoké a kritické nálezy blokují kontrolu.

Workspace navíc striktně odmítá balíčky vydané před méně než 24 hodinami.
Produkční obrazy používají digestem připnutý Node.js base image, aplikují
aktuální Alpine opravy při sestavení a neobsahují nepotřebné npm/Corepack CLI.
Před vydáním se výsledné runtime obrazy kontrolují na známé zranitelnosti.
CI používá Gitleaks pro kontrolu tajných údajů a Trivy pro web, API i worker;
vysoký nebo kritický nález sestavení zablokuje. Externí CI akce jsou připnuté
na přesný commit.
Celý bezpečnostní gate se spouští denně. Dependabot sleduje npm, Docker a
GitHub Actions jednou týdně.

## Ochrana hromadných změn

Nové schedule-changes i rychlá kapacita podléhají AdminRoleGuard a MFA.
Hash náhledu zahrnuje vybrané řady, vstup, dotčené termíny a aktivní rezervace
včetně cen a ochrany poplatků. Kontrola a zápis jsou transakční. Uzavření
rezervací je vynuceno při rezervaci pod zámkem termínu, ne pouze v UI.
Koncepty formulářů neobsahují tokeny, hesla, MFA ani seznamy účastníků;
jsou odděleny účtem v sessionStorage a odstraní se při odhlášení/uložení.

Serverová obnova MFA relace používá důvěryhodnou interní cestu Keycloak
pro token a JWKS, ale stále vyžaduje podpis, správný veřejný issuer a
audience. Interní cesta neobchází MFA a nemění délku zapamatování zařízení.

### Doprovod a odpovědnost

Doprovod není nový účet. Jméno se zobrazí pouze vlastníkovi a oprávněnému
administrátorovi; kontakt zůstává vlastníka. Backend vyžaduje explicitní
souhlas s odpovědností, ukládá čas souhlasu, verzi podmínek a audit bez jména
v metadatech. Oprávnění storna se ověřuje pro každé ID zvlášť. Jméno není
spolehlivý identifikátor pro kontrolu duplicit mezi různými účty.

## Shared public analytics preparation (2026-10-04)

ADR 0021 and `analytics/integration.md` define the default-off public pageview bridge
and release checks. `analytics/privacy-review.md` contains unpublished CS/EN owner
review drafts. No identified, private, reservation, form or click collection; no new
analytics service or database. Activation and end-to-end shared collector validation
remain pending and must not be represented as completed.

## Approved shared analytics activation (2026-10-04)

Supersedes the earlier default-off preparation: the owner approved the exact
CS/EN notice ef5cbf7 in VCode (approval record 0527093). Publish that supplement
and preserve enabled=true / privacyNoticeApproved=true in normal releases.
Scope and all private-session, DNT/GPC and offline protections in ADR 0021 remain.
Central registry activation and final ingestion verification follow public notice
acceptance; never treat a frontend deployment as proof of received statistics.

## Approved v2 analytics candidate (2026-10-04)

ADR 0022 supersedes the earlier no-click/no-source scope only for the specifically
reviewed v2 replacement (VCode 6dc4dd3, owner approval a56b160). Exact eight public
paths and privacy/session exclusions remain. Only explicit outbound-click on the
Masáže recommendation and Instagram/Facebook links; no destination/content fields.
The local candidate selects v2, captureSources=true. The approved paragraph is
selected with the runtime version; retained v1 text is fallback only. Production
changes wait for the coordinator slot; local tests are not ingestion proof.


## Approved TikTok source runtime — 2026-10-05

ADR 0023 records the verified owner approval to recognize only the TikTok service
label. Serve byte-exact VCode public-v2-tiktok.js as /vcode-analytics-tiktok.js,
SRI sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5.
This narrow exception supersedes the earlier no-copy runtime rule. The existing
v2 endpoint, website ID, gates, exact paths/events, anonymous-session boundary,
DNT/GPC, offline discard and published CS/EN notice are unchanged. Raw URLs,
profiles and videos are never sent; lookalike domains are not TikTok. Release
checks validate committed asset bytes and actual runtime privacy tests. Browser
acceptance uses an isolated memory sink or blocked collector. VCode alone updates
the central registry after verified deployment. Deployment evidence is recorded
in docs/analytics/integration.md.

Obrázek typu lekce v S3 je veřejný pouze při přesné vazbě
`hero_image_path = '/api/v1/media/' || asset.id` u aktivního typu; žádný prefix
ani volný soubor není důvodem ke zpřístupnění. Portrait vyžaduje aktivního
instruktora jako dosud.

Nová rezervace kontroluje aktivní typ lekce na backendu; skrytí katalogu samo není autorizační hranicí. Neaktivní typ zachovává oprávněnému klientovi přístup k jeho existujícím rezervacím.

Storage separation, X5 mount guards, retention, recovery evidence and operational limits: [production storage](production-storage.md) (ADR 0024).

## Provozní výkazy instruktorů a potvrzení lekce (ADR 0026)

Jména instruktorů, odměny a výkazy výuky jsou neveřejná osobní/provozní data.
Čtení, změna, tisk i export vyžadují ověřenou roli `admin` nebo `super_admin`
s MFA. Samotná položka navigace oprávnění neuděluje. API zachová standardní
ErrorResponse/requestId, BFF same-origin/CSRF hranici a `private, no-store`.
Veřejný klient nesmí zjistit výkazy ani odměny odhadnutím ID termínu.

Potvrzení lekce transakčně uloží docházku, případné poplatky, výkaz i audit.
Server ověří konec lekce, její nezrušený stav, instruktora, celý seznam
nepřítomných, `rosterToken` a `expectedVersion`. Token není oprávnění ani
náhrada rolí. Při konfliktu se nic částečně neuloží; retry totožného úspěšného
obsahu nevytvoří druhý výkaz, poplatek ani audit. Zámky dodržují termín před
rezervacemi. Uhrazené/prominuté poplatky zůstanou při opravě docházky nedotčené.

Oprava výkazu vyžaduje důvod a záznam starých/nových hodnot, verze, admin
subjektu a requestId. Audity nesmějí mizet při úklidu cache/releasů. Export
obsahuje pouze provozní výuku vybraného měsíce, ne kontakty klientů, hesla,
identity tokeny či nadbytečné poznámky. Textová pole exportu musí být bezpečná
pro CSV import, včetně hodnot začínajících znaky tabulkových vzorců.

Výkazy a docházka se neposílají do sdílené veřejné analytiky. Nové klientské
sekce Novinky/Zprávy zůstávají soukromé; stávající cookie, DNT/GPC a offline
ochrany analytiky se změnou lišty nemění. Výkaz není mzdový systém ani záruka
úplné zákonné evidence DPP. Zpracovává jen nezbytný skutečný čas výuky a
ručně zadanou odměnu; příprava nebo jiné pracovní činnosti se neodhadují.

## Anonymní návrhy recenzí (CD-072 / ADR 0029)

Návrh není publikovaná recenze ani důkaz návštěvy. Neveřejný výpis a rozhodnutí
jsou pod stávajícím admin role/MFA guardem a odpovědi `private, no-store`.
Schválení/odmítnutí a minimální audit jsou atomická transakce; jedinečná vazba
brání dvěma publikacím při souběhu. Původní autor, text a rating jsou chráněné
před následným přepsáním ve starém editoru. Odmítnutí vyžaduje důvod.

Anonymní POST nepoužívá klientskou ani admin cookie; přijímá pouze JSON z
přesného originu `PUBLIC_APP_URL`, prázdný honeypot, explicitní souhlas
aktuální verze a účelově oddělený HMAC token podepsaný `SESSION_SECRET`.
Výzva expiruje za 30 minut a lze ji použít nejdříve po 2 sekundách.
Nelze ji zaměnit za session, autentizační nebo jiný token. Její nonce a
obsahový otisk zajistí idempotenci; změna těla při témže nonce vrátí 409.
Token ani obsah recenze se nesmějí objevit v logu, URL, analytice nebo trvalé
browser cache. Úspěch nevrací ID, text ani jméno klienta.

Databáze koordinuje 30 přijatých návrhů na síť a 200 celkem za klouzavých
60 minut pod globálním transakčním advisory lockem sdíleným API replikami. Normalizovanou /24 IPv4 nebo /56 IPv6 síť reprezentuje účelově
oddělený HMAC otisk; původní IP/síť se neukládá. Krátkodobé záznamy přijatých odeslání
expirují po 2 hodinách a worker je odstraňuje v omezených dávkách každých
10 minut i bez nových odeslání. Jedná se o omezení četnosti, nikoli nezávislé ověření
člověka: útočník s různými sítěmi může limit obejít, naopak společná síť studia
může limit vyčerpat. Při chybě DB se nic nepřijme jen do paměti a nepředstírá
se úspěch. Produkční proxy hranice musí používat důvěryhodné údaje o síti,
ne libovolný klientský `X-Forwarded-For`.

Souhlas `reviews-public-v1-2026-10-10` eviduje čas a verzi pro jméno/iniciály,
text a dobrovolné hodnocení. Formulář nežádá kontakt ani zdravotní údaje.
Žádost o odvolání souhlasu nebo opravu se řeší přes zveřejněný kontakt studia
s přiměřeným ověřením; nevzniká anonymní mazací endpoint. Studio může
publikovanou recenzi ihned skrýt. Recenze, souhlasy a audit nemají automatické
mazání bez schválené politiky; 2hodinová retence se vztahuje pouze na technické
počítadlo. Nezavádí se externí CAPTCHA, nový vendor, e-mail ani push.
`/recenze/napsat`, `/recenze/qr` a jakákoli pole/události formuláře zůstávají
mimo dosavadní přesný allowlist VCode analytiky.

## Bezpečná obnova hesla a dočasné blokování (CD-073)

Password-only flow podle ADR 0031 nesmí obsahovat `reset-otp`. E-mailový
krok `force-login=true` ukončí obnovu bez přihlášené relace, a proto nemůže
nahradit povinný administrátorský druhý faktor. Jednorázový odkaz má 15 minut.
Neutrální výsledek neprozrazuje existenci účtu ani úspěch doručení.

Reset se zapíná až po ověření odesílatele a bezpečného SMTP; klient se nikdy
nevyzývá k zaslání hesla či OTP podpoře. Klíče se nepřenášejí do prohlížeče
a operations přístup se nerozšiřuje o správu zákazníků. Dočasné blokování
používá 5 pokusů, 60 sekund, strop 900 sekund, reset 1800 sekund a vypnuté
trvalé i sekundární blokování. Samotná veřejná chybová zpráva nerozlišuje
chybné údaje od ochranné prodlevy. Parametry se ověřují čtením i skutečným
přihlášením pouze syntetických účtů v izolovaném prostředí.

Reset token, query, Referer, cookies a formuláře nesmí vstoupit do DMZ
přístupových záznamů. Dedicated login host má bezpečný formát a `no-referrer`;
raw Nginx identity error log je vypnutý, protože neumí redigovat request URI.
Bezpečný status/request ID a chráněné Keycloak události zůstávají. Ověřuje se
také chyba upstreamu a HTTP redirect. Toto se týká pouze identity hostu,
nikoli plošného vypnutí logů jiných aplikací.

Omezení četnosti na dedicated login hostu se týká pouze POST formulářů
`/realms/studio-balance/login-actions/`: průměr 10 za minutu na IP, krátká
špička 20 požadavků navíc. GET, zdroje tématu, token refresh a ostatní realmy
se neomezují tímto pravidlem. Překročení vrací srozumitelnou chybu 429
a `Retry-After: 60`; chrání také obnovu před zneužitím k rozesílání zpráv.


## Administrative seat cancellation (CD-074)

Preview/apply require MFA administrator cookies and existing same-origin proxy
protections. Service also checks roles/MFA. No client subject/cookie delegation.
Server derives owner and amounts, validates both-seat scope and state fingerprint,
serializes retries with an actor/key transaction lock and persists receipts in
migration 0033. Separate client idempotency and identity remain unchanged. Existing
fees, started lessons and confirmed instructor records fail closed. Reasons are
bounded strings rendered as text; never public analytics or structured log fields.
Waiver needs an explicit additional reason and is audited without deleting fees.

Kontrola knihoven 27. 10. 2026 a opravené transitivní větve jsou evidované
v [dependency-audit.md](dependency-audit.md). Aktualizace nemění MFA, cookies,
CSRF, síťové hranice ani cenová/storno pravidla. Před nasazením se ověřuje
lockfile audit, aplikační testy a všechny tři výsledné produkční obrazy.

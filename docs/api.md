# API

## Status a účel

Studio Balance potřebuje jedno API pro veřejný web, klientský účet a administraci.
Závazným strojovým kontraktem je `openapi/openapi.json`. Aktuální první
vertikální řez implementuje health/readiness, veřejné typy lekcí a termíny,
schválené recenze, profil klienta, vytvoření a výpis vlastních rezervací a
bezpečné storno s preview důsledku. Ostatní katalog v tomto dokumentu je
roadmapa; funkční endpoint se smí implementovat až po doplnění do OpenAPI.

## Zdroje pravdy

- JSON-first kontrakt: `openapi/openapi.json`;
- lidské záměry a pravidla: tento dokument;
- obchodní pravidla: `docs/requirements.md`;
- autorizace a ochrana dat: `docs/security.md`.

YAML může existovat jen jako generovaný export označený jako generovaný.

## Base URL a verzování

| Prostředí | URL |
| --- | --- |
| lokální vývoj | `http://localhost:3001` |
| test/staging | TBD |
| produkce | `https://studiobalance.zeleznalady.cz` |

Systémové cesty `/health` a `/ready` nejsou verzované. Produktové REST cesty
používají `/api/v1/...`. Breaking změna vyžaduje novou verzi nebo migrační
strategii a ADR.

## Autentizace

Identita používá Keycloak/OIDC podle ADR 0004. Kontrakt musí podporovat:

- OIDC Authorization Code flow s PKCE a bezpečnou HTTP-only serverovou relaci;
- oddělené klientské a admin přihlášení/policies a admin MFA;
- ověřený e-mail jako podmínku vytvoření rezervace;
- reset hesla s krátkou jednorázovou platností;
- serverovou objektovou autorizaci každé chráněné operace.

Veřejný obsah a rozvrh jsou anonymní. Rezervace a `me` cesty vyžadují klienta;
`admin` cesty vyžadují příslušnou administrativní roli.

`GET /api/v1/me` a `PATCH /api/v1/me` jsou implementované chráněné cesty. Čtou pouze relaci
vydanou webovou BFF po OIDC callbacku, nikdy OIDC token z browser JavaScriptu.
Profil je svázaný s Keycloak subjectem a ukládá jméno, příjmení, telefon,
ověřený e-mail a přijatou verzi podmínek.

## Konvence

- JSON media type `application/json`; UTF-8;
- veřejné identifikátory jsou neprůhledné UUID;
- timestamps používají RFC 3339/ISO 8601 s offsetem;
- session objekt nese IANA timezone `Europe/Prague`;
- měnová částka je decimal string + `currency: "CZK"`, nikdy binární float;
- klient posílá `Accept-Language`; první verze vrací české bezpečné texty;
- každý request má nebo dostane `X-Request-ID`; response ho vrací;
- změnové požadavky na rezervaci podporují `Idempotency-Key`;
- seznamy používají cursor pagination tam, kde mohou růst;
- neznámé pole se podle zvolené validační politiky buď odmítne konzistentně,
  nebo ignoruje; politika se musí zafixovat v OpenAPI.

## Jednotná chyba

```json
{
  "error": {
    "code": "SESSION_FULL",
    "message": "Omlouváme se, lekce se právě obsadila. Vyberte si prosím jiný termín.",
    "details": [],
    "requestId": "req_abc123"
  }
}
```

`code`, `message` a `requestId` jsou povinné. `details` nesmí obsahovat stack,
SQL, token, interní poznámku ani cizí osobní údaje.

Doporučené doménové kódy:

| HTTP | Code | Význam |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | neplatný vstup |
| 401 | `AUTHENTICATION_REQUIRED` | chybí/propadla identita |
| 403 | `FORBIDDEN` | identita nemá oprávnění |
| 404 | `RESOURCE_NOT_FOUND` | objekt neexistuje nebo nesmí být odhalen |
| 409 | `SESSION_FULL` | kapacita byla mezitím naplněna |
| 409 | `BOOKING_ALREADY_EXISTS` | klient už má aktivní rezervaci |
| 409 | `BOOKING_STATE_CONFLICT` | operace neplatí pro aktuální stav |
| 409 | `LATE_CANCELLATION_CONFIRMATION_REQUIRED` | nutné potvrdit známou částku fee |
| 410 | `BOOKING_CLOSED` | rezervační okno skončilo |
| 429 | `RATE_LIMITED` | ochranný limit |
| 503 | `DEPENDENCY_UNAVAILABLE` | potřebná závislost není připravena |

## Veřejný endpoint katalog

Implementované jsou veřejný katalog a detail lekcí, seznam termínů, detail
termínu a čtení publikovaných recenzí. Ostatní řádky jsou plánované a nejsou
součástí aktuálního OpenAPI.

| Metoda | Cesta | Účel |
| --- | --- | --- |
| GET | `/api/v1/class-types` | aktivní typy lekcí |
| GET | `/api/v1/class-types/{slug}` | obsah typu a nejbližší termíny |
| GET | `/api/v1/sessions?from=&to=` | veřejný rozvrh v omezeném intervalu |
| GET | `/api/v1/sessions/{id}` | detail konkrétního termínu |
| GET | `/api/v1/instructors` | veřejné profily aktivních instruktorů |
| GET | `/api/v1/news` | publikované novinky |
| GET | `/api/v1/gallery` | publikovaná galerie |
| GET | `/api/v1/reviews` | aktivní seřazené recenze |
| GET | `/api/v1/prices` | informační ceník bez nákupu |
| GET | `/api/v1/faq` | aktivní FAQ |
| GET | `/api/v1/studio` | kontakty, mapa, sítě a provozní texty |

### Veřejný termín

Minimální veřejná reprezentace:

```json
{
  "id": "uuid",
  "classType": { "name": "Balance Flow", "slug": "balance-flow" },
  "instructor": { "id": "uuid", "displayName": "..." },
  "startAt": "2026-08-06T17:00:00+02:00",
  "endAt": "2026-08-06T18:00:00+02:00",
  "timezone": "Europe/Prague",
  "arrivalAt": "2026-08-06T16:50:00+02:00",
  "availability": "bookable",
  "price": { "amount": "260.00", "currency": "CZK" },
  "location": { "name": "Studio Balance", "address": "..." }
}
```

Zakázaná veřejná pole: `capacity`, `activeBookings`, `remaining`, interní
poznámka, seznam klientů a jakýkoli waitlist údaj.

`availability` je jeden z `bookable`, `full`, `closed`, `cancelled`,
`completed`.

### Veřejná recenze

`GET /api/v1/reviews` vrací pouze publikované recenze s doloženým souhlasem.
Volitelný query parametr `featured=true` omezí výstup na nejvýše šest referencí
pro titulní stránku. Response neobsahuje interní příznak souhlasu ani koncepty.
`rating` je `null`, pokud klientka skutečné hodnocení neposkytla; nesmí se
dopočítat z náročnosti lekce. `source` je volitelný údaj o původu reference a
ve veřejné odpovědi je `null`, pokud nebyl zadán. Odkaz na typ lekce se vrací
jen pro aktuálně aktivní typ, aby veřejná reference nevedla na neaktivní detail.

## Identita a profil

Registrace, login, logout, reset a ověření e-mailu jsou Keycloak
OIDC/browser workflow, nikoli vlastní password endpointy doménového API. Webová
BFF vrstva drží tokeny mimo browser JavaScript. Do OpenAPI patří až skutečně
implementované aplikační operace:

| Metoda | Cesta | Účel |
| --- | --- | --- |
| GET | `/api/v1/me` | profil klienta spojený s OIDC subjectem |
| PATCH | `/api/v1/me` | povolené doménové profilové změny |
| GET | `/api/v1/me/notifications` | posledních 20 zpráv patřících přihlášenému klientovi |
| DELETE | `/api/v1/me` | žádost/proces zrušení účtu |

Zprávy v účtu obsahují potvrzení rezervace a provozní změny. Nejsou určené pro
marketingovou komunikaci a endpoint nikdy nevrací zprávy jiného klienta.

Issuer je `https://login.zeleznalady.cz/realms/studio-balance`;
klienti jsou `studiobalance-web` a `studiobalance-admin`. Callback/logout URL
mají přesný allowlist. Reset nesmí prozradit existenci e-mailu.

## Rezervace

V aktuálním řezu jsou implementované vytvoření rezervace, výpis vlastních
rezervací, cancellation preview a storno. Samostatný detail rezervace je
roadmapa a zatím není v OpenAPI.

| Metoda | Cesta | Účel |
| --- | --- | --- |
| POST | `/api/v1/bookings` | idempotentní vytvoření rezervace |
| GET | `/api/v1/me/bookings` | nadcházející a historie |
| GET | `/api/v1/me/bookings/{id}` | vlastní detail |
| GET | `/api/v1/me/bookings/{id}/cancellation-preview` | on-time/late důsledek před akcí |
| POST | `/api/v1/me/bookings/{id}/cancel` | idempotentní potvrzené storno |

### Vytvoření rezervace

Request nese `sessionId`, `termsVersion` a důkaz požadovaného potvrzení. Server
znovu ověří termín, kapacitu, duplicitu a verzi podmínek v transakci.

`Idempotency-Key` se váže na klienta, endpoint a normalizovaný request. Stejný
key + stejný request vrátí původní výsledek; stejný key + jiný request je
konflikt. Odlišný key pro již existující aktivní rezervaci vrátí
`BOOKING_ALREADY_EXISTS`.

### Storno

Preview vrátí serverem vypočtený mód, cutoff a případnou částku:

```json
{
  "mode": "late",
  "cutoffAt": "2026-08-05T17:00:00+02:00",
  "fee": { "amount": "260.00", "currency": "CZK" },
  "paymentMethod": "at_studio"
}
```

Late cancel request musí obsahovat potvrzení důsledku. Response uvádí stav
rezervace, zda fee vznikl, jeho částku a že se řeší ve studiu. Online payment
URL nebo payment token jsou zakázané.

## Administrace

| Oblast | Doporučené cesty |
| --- | --- |
| typy lekcí | `GET/POST /api/v1/admin/class-types`, `GET/PATCH /api/v1/admin/class-types/{id}` |
| termíny | `GET/POST /api/v1/admin/sessions`, `GET/PATCH /api/v1/admin/sessions/{id}` |
| série/výjimky | explicitní create/update occurrence endpoints dle finálního modelu recurrence |
| zrušení | `POST /api/v1/admin/sessions/{id}/cancel` |
| oznámení dopadu | `POST /api/v1/admin/sessions/{id}/notify` pouze pokud není automatickou součástí změny |
| seznam rezervací | `GET /api/v1/admin/sessions/{id}/bookings` |
| ruční rezervace | `POST /api/v1/admin/bookings` |
| docházka/oprava | `POST /api/v1/admin/bookings/{id}/attendance`, explicitní audited correction |
| fee | `POST /api/v1/admin/cancellation-fees/{id}/settle|waive|cancel` |
| instruktoři | CRUD `/api/v1/admin/instructors` |
| klienti | `GET/PATCH /api/v1/admin/users` + export/privacy operace |
| obsah | zdrojově specifické CRUD cesty pod `/api/v1/admin/content/...` |
| média | bezpečný upload/finalize model pod `/api/v1/admin/media` |
| audit | read-only `GET /api/v1/admin/audit-log` |

První provozní řez implementuje dashboard, typy lekcí, instruktory, termíny,
zrušení termínu, seznam klientů, seznam rezervací, evidenci účasti/neúčasti a
`GET/POST/PATCH /api/v1/admin/content/reviews` pro koncept, publikaci, skrytí a
řazení schválených recenzí.
Všechny cesty používají samostatnou HTTP-only admin relaci, vyžadují roli
`admin` nebo `super_admin`; administrační výpis je `private, no-store` a každá
změna se zapisuje spolu s auditním záznamem v jediné databázové transakci.
Zdroj reference je volitelný. Při přiřazení lekce musí typ existovat a
publikovaná reference smí odkazovat pouze na aktivní typ lekce. Série,
ruční rezervace, poplatky, obsah, média a čtení auditu zůstávají následujícím
řezem; tabulka výše je cílový kontrakt.

Generické wildcard endpointy se v OpenAPI nepoužívají; každý konkrétní resource
dostane vlastní operaci, schema, oprávnění a auditní pravidlo.

## Systémové endpointy

- `GET /health`: liveness procesu, bez testování vzdálených závislostí;
- `GET /ready`: 200 pouze pokud jsou povinné závislosti použitelné, jinak 503
  `ErrorResponse`.

Endpointy nesdělují secret, DSN, hostname databáze ani osobní data.

## Cache a souběh

Veřejné GET lze cacheovat s ETag/krátkým TTL. Změnové endpointy a `me/admin`
odpovědi jsou privátní/no-store podle citlivosti. ETag není ochrana kapacity;
rezervace vždy provede autoritativní serverovou transakci.

## Client generation a změnový proces

Web, administrace a serverové integrace mají generovat nebo typově odvozovat klienty z
`openapi/openapi.json`. Změna API probíhá v pořadí:

1. aktualizovat požadavek a případně ADR;
2. změnit OpenAPI JSON a lidský popis;
3. spustit lint/diff a vygenerovat typy;
4. implementovat server;
5. doplnit kontraktní, autorizační a integrační testy;
6. aktualizovat klienty a rollout/kompatibilitu.

## Validace

Aktuálně dostupné minimum:

```bash
python3 -m json.tool openapi/openapi.json >/dev/null
bash scripts/validate-skeleton.sh
```

Scaffold generuje TypeScript kontrakty z OpenAPI příkazem
`pnpm generate:contracts`. OpenAPI schema lint, breaking-change diff a test
shody implementace.

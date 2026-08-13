# ADR 0004: Keycloak identita a webová relace

- Status: Accepted
- Datum: 2026-08-04
- Rozhodl: zadavatel Studio Balance

## Kontext

Veřejný rozvrh je anonymní, rezervace vyžaduje ověřeného klienta a administrace
potřebuje oddělený vstup se silnějším ověřením. Na `docker.home.cz` už běží
Keycloak 26.1.5. Aplikace je web-only podle ADR 0003, proto nepotřebuje nativní
token storage ani mobilní OAuth klienty.

## Rozhodnutí

1. Identity provider je Keycloak 26.1.5 nebo kompatibilní bezpečnostní update
   stejné hlavní verze.
2. Studio Balance používá vyhrazený realm `studio-balance`.
3. Klientská a administrativní plocha používají oddělené confidential OIDC
   klienty `studiobalance-web` a `studiobalance-admin` s oddělenými policies,
   callback/logout URL a credentials.
4. Přihlášení používá OIDC Authorization Code flow s PKCE. Browser nedostane
   client secret ani refresh token; tokeny drží serverová BFF/session vrstva.
5. Webová relace je `HttpOnly`, `Secure`, vhodně `SameSite`, krátkodobá a
   rotovaná po přihlášení nebo změně oprávnění. API validuje issuer, audience,
   podpis, expiraci a požadované claims.
6. Produkční issuer je
   `https://login.zeleznalady.cz/realms/studio-balance` a vede přes
   Nginx na `dmz.home.cz` do Keycloaku na `docker.home.cz`.
7. Klientská registrace je bez e-mailového ověření, dokud Studio Balance nemá
   bezpečně provozovaný SMTP sender. Před rezervací klient doplní jméno,
   příjmení a telefon a přijme aktuální podmínky. Odkaz na obnovu hesla je do
   zprovoznění SMTP vypnutý, aby nesliboval nedoručitelný e-mail.
8. MFA je povinné pro role `admin` a `super_admin`; minimální faktor je TOTP.
   WebAuthn lze přidat jako silnější alternativu. Klientská MFA není v první
   verzi povinná.
9. Keycloak poskytuje identity a role `client`, `admin`, `super_admin`, ale
   objektovou autorizaci rezervací a privilegovaných akcí vždy znovu vynucuje
   API. Aplikační profil se váže na stabilní OIDC claim `sub`, ne na měnitelný
   e-mail.
10. Lokální Docker Compose spouští projektovou Keycloak instanci stejné hlavní
    verze s verzovanou bezpečnou dev realm konfigurací a syntetickými účty.
    Lokální vývoj nezávisí na produkčním Keycloaku.

## Bezpečnostní a provozní podmínky

- OIDC client secrets jsou pouze v secret store a nikdy v browser bundle;
- callback, logout a web origins používají přesný allowlist, ne wildcard;
- produkční bootstrap admin je po provisioningu zneplatněn nebo zabezpečen
  podle provozního postupu;
- admin konzole není volně publikovaná bez síťového a rolového omezení;
- realm konfigurace, signing keys a databáze mají vlastníka, zálohu, upgrade a
  restore test;
- Keycloak dostane healthcheck, resource limits, logy, metriky a alert na
  nedostupné login/issuer metadata;
- změna role, MFA reset a recovery jsou auditované privilegované operace;
- aplikace neimplementuje paralelní vlastní password databázi.

## Důsledky

- scaffold musí obsahovat lokální Keycloak Compose službu a automatizovatelný
  dev realm import;
- `.env.example` a provozní konfigurace obsahují issuer a dva OIDC klienty;
- OpenAPI chráněných endpointů bude používat schválené OIDC bearer/session
  security schéma;
- testy pokryjí jednoduchou klientskou registraci, chybný issuer/audience, expiraci, role, MFA
  admina, odhlášení a změnu oprávnění;
- veřejná auth URL potřebuje DNS, TLS a Nginx konfiguraci na DMZ.

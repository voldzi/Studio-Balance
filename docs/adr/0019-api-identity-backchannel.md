# ADR 0019: Interní cesta pro obnovu identity v API

- Status: Accepted
- Datum: 2026-10-01

## Problém

Web používá interní Keycloak cestu, API však obnovovalo relace přes veřejnou
DMZ. Produkční veřejná cesta z API vrací 401; první obnova po 15 minutách
proto zneplatní relaci, i když je zařízení zapamatované na 90 dní.

## Rozhodnutí

Také API dostává existující `OIDC_BACKCHANNEL_ISSUER_URL`. Token endpoint,
JWKS a odhlášení používají tento důvěryhodný interní endpoint. Při prázdné
hodnotě zůstává dosavadní veřejná cesta pro místní vývoj. Ověření podpisu,
veřejného issueru a audience ani původní MFA assurance se nemění.

## Ověření

Test s podepsaným tokenem ověří interní token/JWKS cestu a odmítnutí tokenu
s jiným issuerem. V produkci ověřit obnovu existující MFA relace a platnost
po opětovném načtení administrace. Odhlášené relace se neobnovují.

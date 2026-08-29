# ADR 0008: Produkční issuer existujícího Keycloaku

- Status: Accepted
- Datum: 2026-08-04

## Rozhodnutí

Produkční realm `studio-balance` používá issuer
`https://login.zeleznalady.cz/realms/studio-balance`. Běžící Keycloak 26.1.5
má tento hostname striktně nastavený a discovery realmu jej 2026-08-04 ověřilo.
Toto rozhodnutí nahrazuje hostname `auth.studiobalance.zeleznalady.cz` v ADR
0004; realm, oddělené confidential klienty, PKCE, ověření e-mailu a role nemění.

## Důsledky

Nevzniká další veřejná Keycloak routa ani restart sdílené identity služby.
Aplikační runtime musí validovat přesně tento issuer. Povinné TOTP pro skutečné
administrátorské účty se dokončí při založení prvního takového účtu.

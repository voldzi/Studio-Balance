# ADR 0011: Vlastní kanonická doména Studio Balance

## Stav

Přijato 2026-08-24.

## Kontext

První veřejná verze byla dočasně publikována na
`studiobalance.zeleznalady.cz` a produkční realm na sdíleném hostname
`login.zeleznalady.cz`. Zadavatel pořídil doménu `studio-balance.cz` a
výslovně rozhodl, že výsledný produkt nemá na doméně `zeleznalady.cz`
provozně záviset.

## Rozhodnutí

- kanonická aplikace je `https://studio-balance.cz`;
- `https://www.studio-balance.cz` odpoví trvalým přesměrováním na kanonický
  hostname a zachová cestu i query;
- produkční realm `studio-balance` je veřejně dostupný přes
  `https://login.studio-balance.cz/realms/studio-balance`;
- Keycloak zůstává stejným identity systémem a účty se nemigrují ani
  neduplikují; mění se realm frontend URL, OIDC callbacky a runtime issuer;
- konfigurace Studio Balance nevytváří ani nevyžaduje aplikační či přihlašovací
  hostname na doméně `zeleznalady.cz`;
- DNS publikuje pouze ověřené IPv4 adresy DMZ. Záznam AAAA se nepoužije, dokud
  nebude DMZ prokazatelně obsluhovat veřejnou IPv6;
- certifikát pokrývá `studio-balance.cz`, `www.studio-balance.cz` a
  `login.studio-balance.cz`;
- aplikace publikuje sitemapu a robots pravidla z `PUBLIC_APP_URL`; API,
  autentizační callbacky, účet a administrace se neindexují.

## Bezpečný přechod

1. DNS rootu, `www` a `login` se nasměruje na DMZ a odstraní se nefunkční
   AAAA.
2. Nginx vystaví nové hostnames a získá TLS.
3. Keycloak nastaví nový realm frontend a callbacky pouze pro novou aplikaci.
4. Produkční `PUBLIC_APP_URL` a `OIDC_ISSUER_URL` se přepnou společně a
   aplikace se znovu nasadí.
5. Ověří se login, rezervace, administrace, sitemap a kanonická metadata.

Každý krok je vratný bez změny databáze účtů nebo rezervací.

## Dopad

Toto ADR nahrazuje doménové části ADR 0002, ADR 0007 a ADR 0008. Topologie
`dmz.home.cz` → `docker.home.cz`, produkční PostgreSQL přes HAProxy a
oddělené web/admin OIDC politiky se nemění.

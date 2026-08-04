# ADR 0007: Publikace webového preview přes DMZ Nginx

- Status: Accepted
- Datum: 2026-08-04
- Rozhodl: vlastník produktu

## Kontext

Izolovaný preview stack podle ADR 0006 běží na `docker.home.cz`. Vlastník
požádal připravit následující krok: publikaci přes Nginx na `dmz.home.cz` pro
`studiobalance.zeleznalady.cz`, ještě před připojením produkčního PostgreSQL a
Keycloaku. DNS A záznam už překládá na `185.186.161.93`, ale 2026-08-04 HTTP
nevracelo odpověď a TLS končilo chybou nerozpoznaného SNI jména.

## Rozhodnutí

1. Nginx proxyuje `/` na `docker.home.cz:3280` a `/api/` na
   `docker.home.cz:4280` bez změny API cesty.
2. Veřejný virtual host nepublikuje technické `/health` a `/ready`; provozní
   kontrola je provádí přímo na interním API upstreamu.
3. První aktivace používá Let's Encrypt certifikát a následně trvalý HTTP →
   HTTPS redirect. HSTS se vztahuje jen na aplikační hostname, ne na subdomény.
4. Verzovaný instalační skript vyžaduje výslovné `--activate-preview`, ověří
   DNS a oba upstreamy, zálohuje starou konfiguraci, po každé změně spustí
   `nginx -t` a při chybě provede rollback.
5. SSH klíč dostupný vývojovému prostředí nebyl na `dmz.home.cz` přijat, proto
   skript spustí správce infrastruktury s `sudo`. Kontaktní e-mail pro ACME se
   nepředjímá ani neukládá do repozitáře.
6. Publikace preview nemění jeho dočasnou databázi a nezapojuje produkční
   PostgreSQL, Keycloak nebo S3. Tyto závislosti zůstávají následujícími řezy.

## Důsledky

- veřejnou cestu lze aktivovat reprodukovatelně bez sdílení sudo nebo SSH
  credentials;
- po spuštění skriptu je nutné z internetu ověřit HTTPS, redirect, webové
  routes a `/api/` před tím, než se publikace označí jako dokončená;
- současný obsah je vývojový preview, nikoli dokončený produkční web.

## Realizace

Aktivace proběhla 2026-08-04 pro preview image `e10a7ad`. Let's Encrypt vydal
certifikát platný do 2026-11-02 a Certbot nastavil automatickou obnovu. Externí
kontrola potvrdila HTTP → HTTPS redirect, HTTPS 200 a veřejné 404 pro `/health`
i `/ready`.

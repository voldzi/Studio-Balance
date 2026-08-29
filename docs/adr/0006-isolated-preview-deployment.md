# ADR 0006: Izolované náhledové nasazení na Docker hostiteli

- Status: Accepted
- Datum: 2026-08-04
- Rozhodl: vlastník produktu a technická implementace

## Kontext

První aplikační základ potřebuje ověření v cílovém Docker prostředí ještě před
zapojením veřejné DMZ cesty, produkční databáze, identity a médií. Vlastník
výslovně určil pořadí: nejprve aplikace na `docker.home.cz`, potom Nginx na
`dmz.home.cz`, následně PostgreSQL a produkční Keycloak.

## Rozhodnutí

1. Na `docker.home.cz` vznikne neveřejný Compose projekt
   `studio-balance-preview` s webem, API, workerem a jednorázovou migrací.
2. Náhled dočasně používá vlastní PostgreSQL 18 volume bez publikovaného host
   portu. Není to produkční databáze ani náhrada schváleného
   `haproxy.home.cz:5000`.
3. Web je pro interní ověření dostupný na host portu 3280 a API na 4280. Žádný
   z portů se v tomto řezu nepublikuje přes DMZ nebo DNS.
4. Image se sestavují z přesného Git commitu, označují jeho SHA a procesy
   aplikace běží jako neprivilegovaný uživatel. Compose používá healthchecky,
   resource limits, `no-new-privileges` a oddělené názvy projektu i volume.
5. Náhledové databázové heslo vznikne náhodně na hostiteli, má mód 0600 a
   zůstává mimo release adresáře i Git. Nasazovací výstup jeho hodnotu
   nezobrazuje.
6. Nasazení se odmítne při méně než 20 GiB volného disku nebo 2 GiB dostupné
   paměti. Předchozí image a release lze znovu aktivovat verzovaným rollback
   příkazem; databáze se při aplikačním rollbacku neobnovuje ze zálohy.
7. Produkční HAProxy databáze, Keycloak, S3 gateway, DMZ Nginx a veřejné TLS
   zůstávají v tomto řezu nedotčené.

## Důsledky

- cílový Docker runtime lze ověřit bez produkčních dat a credentials;
- náhled není produkčním spuštěním ani veřejným stagingem;
- následná změna databáze a identity vyžaduje vlastní readiness gate,
  konfiguraci secretů, zálohy a smoke testy;
- veřejná publikace vznikne až samostatně řízenou změnou na `dmz.home.cz`.

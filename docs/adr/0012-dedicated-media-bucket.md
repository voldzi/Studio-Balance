# ADR 0012: Vlastní bucket ve sdíleném SeaweedFS

- Status: Accepted
- Datum: 2026-09-05
- Autorita: CD-046, zadavatelem určený endpoint a poskytnutý SSH přístup
- Nahrazuje: ADR 0002 pouze v umístění S3 a potřebě samostatné S3 brány

## Rozhodnutí

Použít existující SeaweedFS 4.29 na `http://storage.home.cz:8333` s bucketem
`studio-balance-media`. API na `docker.home.cz` má vlastní účet omezený na
čtení, zápis a seznam tohoto bucketu. Zálohování má samostatný účet pouze
pro čtení a seznam. Žádné credentials jiného projektu se nepředávají aplikaci.

Bucket je neveřejný. Publikované fotografie poskytuje existující media API;
koncepty vyžadují administrátorské oprávnění. S3 endpoint je interní HTTP
trasa určená zadavatelem, bez TLS; nevystavuje se přes veřejnou DMZ.

Sdílená statická konfigurace se doplní pod zámkem se zachováním ostatních
identit, zálohou a načtením pomocí SIGHUP. Datové soubory ani konfigurace
cizích účtů se nemění. Provisioning nevypisuje tajné údaje.

## Obnova a provoz

Zapnout verzování bucketu a denně zálohovat aktuální objekty s manifestem a
SHA-256 na `docker.home.cz`, mimo server úložiště. Zálohy se automaticky
nemažou, dokud správce neurčí retenční politiku. Ověřit obnovu testovacího
objektu a průběžně kontrolovat stáří poslední úspěšné zálohy i volné místo.
Obnova skutečného obsahu musí zachovat vazby metadat v PostgreSQL.

Výpadek S3 nesmí blokovat rezervace. Před připojením ověřit zápis, čtení,
smazání, odmítnutí anonymního přístupu a izolaci od jiného bucketu. Dodané
fotografie mohou do řízeného importu dál fungovat jako verzované webové assety.

## Důsledky

Administrátor může nahrávat fotografie proměn a měnit portréty/týmovou fotku.
Textové recenze a novinky dál ukládá PostgreSQL. Obecný editor všech fotografií
webu ani nové obsahové typy nejsou součástí tohoto infrastrukturního kroku.
Bucket odděluje data a oprávnění, nikoli výpadky sdílené služby.

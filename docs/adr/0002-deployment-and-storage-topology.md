# ADR 0002: Produkční a lokální infrastrukturní topologie

- Status: Accepted
- Datum: 2026-08-04
- Rozhodl: zadavatel Studio Balance

## Kontext

Projekt potřebuje kanonický repozitář, veřejnou internetovou cestu, lokální
vývojové prostředí, produkční runtime, transakční perzistenci a případné
úložiště obsahových médií. Předchozí návrh ponechával hosting, ingress a
samostatné object storage otevřené. Dne 2026-08-04 proběhla read-only inventura
`docker.home.cz`; podrobnosti jsou v `docs/infrastructure-assessment.md`.

## Rozhodnutí

1. Kanonický repozitář je `git@github.com:voldzi/Studio-Balance.git`.
2. Veřejná adresa je `https://studiobalance.zeleznalady.cz`.
3. Internetová publikace vede přes Nginx na `dmz.home.cz`.
4. Produkční aplikační workload běží jako Docker kontejnery na
   `docker.home.cz`.
5. Produkční PostgreSQL se připojuje výhradně přes
   `haproxy.home.cz:5000`; aplikace ani běžné migrace nepoužívají přímé adresy
   databázových uzlů.
   Patroni API na `patroni1.home.cz` potvrdilo PostgreSQL 18.4; lokální vývoj
   a CI používají PostgreSQL major 18.
6. Lokální databáze a další vývojové závislosti běží v Docker Desktop se
   syntetickými daty a jinými credentials než produkce.
7. PostgreSQL je zdroj pravdy pro relační, rezervační, auditní data a metadata
   médií. Produkční binární originály a odvozené varianty používají
   existující S3-kompatibilní službu na `docker.home.cz`.
8. Každé S3 využití musí mít samostatný Studio Balance bucket, vlastní
   credentials s nejmenšími oprávněními, neveřejnou nebo explicitně řízenou
   síťovou cestu, zálohu, restore test a monitoring. Credentials ani bucket
   jiného projektu se nesdílejí.
9. Doporučeným kandidátem je samostatná Studio Balance S3 brána nad existujícím
   backendem `shared-seaweedfs`. Projektové MinIO instance jiných aplikací se
   bez změny vlastnictví a provozního modelu nepoužijí.

```text
Internet
  → studiobalance.zeleznalady.cz
  → dmz.home.cz / Nginx
  → docker.home.cz / Docker aplikace
      → haproxy.home.cz:5000 → PostgreSQL
      → vyhrazená Studio Balance S3 brána → shared-seaweedfs (pokud potřeba)
```

## Důvody

- topologie odpovídá zadané produkční infrastruktuře;
- DMZ Nginx odděluje internet od aplikačního Docker hostu;
- HAProxy odděluje aplikaci od konkrétních PostgreSQL uzlů;
- Docker Desktop umožní reprodukovatelný lokální vývoj bez produkčního přístupu;
- oddělení binárních médií od databáze omezuje růst transakčních záloh;
- samostatný S3 tenant zabraňuje sdílení oprávnění a lifecycle s jiným
  projektem.

## Důsledky

- Nginx routing, TLS certifikát a security headers musí být součástí release
  a provozního ověření;
- aplikace musí bezpečně zvládat dočasnou nedostupnost S3 bez porušení
  rezervačního provozu;
- HAProxy je kritická cesta a potřebuje readiness, monitoring a runbook;
- Docker host potřebuje definovaný registry, rollout a rollback;
- produkční nasazení je blokováno, dokud není vyřešeno zaplnění disku
  `docker.home.cz` (při inventuře 96 %) a ověřena kapacita pro data i zálohy;
- lokální PostgreSQL image musí odpovídat produkční major verzi a relevantnímu
  connection/TLS chování.

## Otevřené implementační detaily

- PostgreSQL database name, TLS režim, credential provisioning a failover
  semantics portu 5000;
- Nginx upstream porty, TLS/certificate automation, HSTS a health-check cesta;
- Docker Compose/Swarm/jiný mechanismus, image registry a deployment pipeline;
- konkrétní SeaweedFS gateway/config, interní endpoint, bucket, lifecycle,
  pinned image, healthcheck a credential provisioning;
- velikostní limity, media processing a delivery cache/CDN;
- RPO/RTO, backup retence, vlastník backupu a restore test pro PostgreSQL i S3;
- plán uvolnění nebo rozšíření kapacity hostitele bez mazání aktivních dat;
- staging topologie.

Tyto detaily nemění přijaté hosty, doménu a bezpečnostní hranice. Doplní se v
provozní dokumentaci nebo dalším ADR před produkčním deploymentem.

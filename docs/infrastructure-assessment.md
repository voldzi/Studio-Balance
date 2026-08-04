# Posouzení infrastruktury `docker.home.cz`

## Účel a rozsah

Tento dokument zaznamenává read-only inventuru provedenou 2026-08-04 pro
rozhodnutí, co lze z existujícího Docker hostitele využít pro Studio Balance.
Kontrola nečetla hodnoty environment secrets, neměnila kontejnery, sítě,
volumes ani data a neprováděla čištění. Jde o bodový stav, který se před
produkčním nasazením musí znovu ověřit.

## Shrnutí rozhodnutí

- Aplikace může běžet na existujícím Docker Engine/Compose hostiteli.
- PostgreSQL 18 zůstává dostupný pouze přes `haproxy.home.cz:5000`; lokální
  PostgreSQL kontejnery jiných projektů nejsou zdrojem pravdy pro Studio
  Balance.
- Produkční média využijí existující S3-kompatibilní infrastrukturu po splnění
  readiness podmínek.
- Preferovaná cesta je samostatná Studio Balance S3 gateway, bucket a
  credentials nad backendem `shared-seaweedfs`.
- MinIO instance `toilet-minio-1` se bez výslovné změny vlastnictví a provozního
  modelu nepoužije, protože její lifecycle je svázaný s projektem Toilet.
- Produkční rollout je blokovaný kapacitou hostitele: root filesystem byl
  zaplněný z 96 % a swap byl plně využitý.

## Stav hostitele

| Oblast | Zjištění | Interpretace pro Studio Balance |
| --- | --- | --- |
| Docker | Engine 29.6.2, Compose 5.3.1, storage driver `overlay2` | Compose je dostupný; Swarm není aktivní |
| Výpočet | 10 CPU, 21 GiB RAM, přibližně 6,7 GiB available | malý nový workload je technicky možný, ale vyžaduje limity a měření |
| Paměť | přibližně 14 GiB použito, 3,1 GiB swap plně využito | před produkcí zjistit příčinu tlaku a nastavit resource limits |
| Disk `/` | 195 GiB celkem, 180 GiB použito, přibližně 7,6 GiB volno (96 %) | blokující riziko pro image pull, build, logy, databáze i objekty |
| Docker objekty | 111 běžících kontejnerů, 3 zastavené, 542 images | host je sdílený a vyžaduje izolaci názvů, sítí a zdrojů |
| Potenciálně uvolnitelné místo | Docker hlásil desítky GiB reclaimable images/cache/volumes | pouze podklad pro správce; žádné automatické mazání bez inventury a schválení |

Před nasazením správce infrastruktury bezpečně prověří aktivní využití image,
cache a volumes, určí retenci a teprve potom uvolní nebo rozšíří kapacitu.
Destruktivní cleanup není součástí projektu ani této inventury.

## S3-kompatibilní kandidáti

### Sdílený SeaweedFS

Compose projekt `shared-seaweedfs` běží s persistentním volume a nabízí S3 API.
Primární služba používá port 8333 a existují oddělené S3 gateway kontejnery pro
další aplikace na portech 8334 a 8335. Neautentizovaný request byl odmítnut 403,
což potvrzuje aktivní auth boundary. Backend volume měl při kontrole přibližně
2 GiB dat.

Použitelný vzor pro Studio Balance:

1. vytvořit vlastní S3 gateway/config v rámci sdíleného SeaweedFS backendu;
2. vytvořit vlastní bucket a minimálně oprávněné access credentials;
3. připojit API/worker přes privátní Docker síť, nikoli automaticky přes veřejný
   host port;
4. oddělit originály a odvozené varianty prefixem nebo buckety;
5. připnout konkrétní image verzi/digest, doplnit healthcheck, resource limits,
   monitoring, backup a restore test;
6. veřejná média doručovat přes aplikační/autorizovanou cache vrstvu, nikoli
   zpřístupněním S3 konzole nebo privátního originálu.

Aktuální SeaweedFS kontejnery používají mutable image tag `latest` a nemají
Docker healthcheck. Stávající primární S3 konfigurace je navázaná na jiný bucket
a externí URL, proto port 8333 není neutrální endpoint pro Studio Balance.

### Projektové MinIO

`toilet-minio-1` nabízí S3 API na portu 9000 a konzoli na 9001, používá
persistentní volume a jeho `/minio/health/live` i `/ready` při kontrole vracely
200. Technicky by zvládlo další bucket, ale container, síť, volume a lifecycle
patří jinému Compose projektu. Sdílení by zvyšovalo riziko společného restartu,
upgradu, credential scope a smazání. Proto není výchozím kandidátem.

## Další potenciálně využitelné služby

| Služba | Potenciální využití | Podmínka |
| --- | --- | --- |
| existující OpenTelemetry/Prometheus/Loki/Tempo/Grafana stack | logy, metriky, trace a alerty | potvrdit vlastníka, tenant/label izolaci, retenci, přístup a kapacitu |
| běžící ClamAV | sken uploadovaných médií | potvrdit síťový přístup, SLA, limity a vlastnictví služby |
| Keycloak 26.1.5 na `docker.home.cz` | preferovaný OIDC identity provider | vlastní realm/klienti, HTTPS issuer přes DMZ, admin MFA, healthcheck, backup a projektová lokální instance ještě vyžadují rozhodnutí |
| Redis/Valkey kontejnery | queue/cache | jsou projektově specifické; nezapojují se bez vlastní instance nebo schváleného sdíleného provozu |

Tyto služby nejsou přijetím této inventury automaticky schválené pro aplikaci.
Pouze S3-kompatibilní uložení médií bylo zadavatelem výslovně povoleno.

### Keycloak

Následná read-only kontrola potvrdila samostatný Compose projekt `keycloak` s
image `quay.io/keycloak/keycloak:26.1` (metadata verze 26.1.5), běžící na
`docker.home.cz` a publikovaný na host portu 8081. Kontejner nemá Docker
healthcheck. Kontrola nečetla environment hodnoty, realm konfiguraci ani
credentials. V aktuálním lokálním Docker Desktop contextu `desktop-linux`
nebyl Keycloak při kontrole spuštěný.

Pro Studio Balance lze službu využít až po vytvoření vlastního realm/clients,
bezpečné HTTPS issuer cesty přes DMZ, rozhodnutí o email verification a admin
MFA, doplnění healthchecku a potvrzení backup/upgrade odpovědnosti. Lokální
vývoj má mít reprodukovatelnou projektovou instanci stejné hlavní verze, nikoli
záviset na dostupnosti sdíleného serveru.

## Produkční readiness gate

Před prvním rolloutem na `docker.home.cz` musí být doloženo:

- volná disková a paměťová rezerva s alert prahy a jmenovitým vlastníkem;
- Compose project name, privátní sítě, porty, resource limits a restart policy;
- registry, immutable image tag/digest, deploy a rollback postup;
- žádný přímý PostgreSQL node mimo `haproxy.home.cz:5000`;
- vlastní S3 gateway/bucket/credentials, pinned image, healthcheck,
  quota/lifecycle, monitoring a úspěšný restore test;
- Nginx upstream a TLS publikace přes `dmz.home.cz` pouze pro veřejné aplikační
  endpointy; administrační S3 konzole se nepublikuje;
- ověřené zálohy PostgreSQL a případných médií a kontrola jejich vzájemné
  konzistence.

## Co inventura neověřila

- obsah ani platnost credentials a secrets;
- PostgreSQL TLS/failover semantics za HAProxy; major 18 a konkrétní verze 18.4
  na `patroni1` byly ověřené;
- garantovanou kapacitu, RPO/RTO nebo SLA existujících služeb;
- backup retenci a poslední úspěšný restore S3 dat;
- DNS, certifikát a konkrétní Nginx upstream konfiguraci na `dmz.home.cz`;
- bezpečnostní zpevnění hostitele a síťových ACL mimo Docker metadata.
- Keycloak realm/client konfiguraci, databázi, backup a veřejnou issuer URL.

Tyto body zůstávají v `open-questions.md` a provozním readiness gate.

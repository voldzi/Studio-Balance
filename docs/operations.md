# Provoz a konfigurace

## Aktuální stav

Repozitář je dokumentační základ bez zvoleného runtime a bez nasazené
aplikace. Níže je cílový provozní kontrakt, nikoli tvrzení o existujícím
prostředí. Přesné install/run/build/test/deploy příkazy se doplní po přijetí
ADR 0001 a vytvoření aplikačního scaffoldu.

Schválená topologie:

- repozitář `git@github.com:voldzi/Studio-Balance.git`;
- veřejná URL `https://studiobalance.zeleznalady.cz`;
- internetový Nginx reverse proxy na `dmz.home.cz`;
- produkční Docker kontejnery na `docker.home.cz`;
- produkční PostgreSQL jen přes `haproxy.home.cz:5000`;
- volitelné S3-kompatibilní úložiště médií na `docker.home.cz` přes vyhrazený
  Studio Balance bucket/gateway;
- lokální služby v Docker Desktop, bez produkčních dat a credentials.

Read-only inventura hostitele a readiness omezení jsou v
`docs/infrastructure-assessment.md`. Zjištěné 96% zaplnění root filesystému a
vyčerpaný swap blokují produkční rollout, dokud správce infrastruktury bezpečně
neuvolní nebo nerozšíří kapacitu a znovu ji neověří.

Aktuálně lze spustit pouze:

```bash
bash scripts/validate-skeleton.sh
python3 -m json.tool openapi/openapi.json >/dev/null
```

## Prostředí

| Prostředí | Účel | Pravidla |
| --- | --- | --- |
| development | lokální vývoj v Docker Desktop | lokální PostgreSQL, syntetická data, ne produkční credentials |
| test/staging | integrace, akceptace a restore test | oddělená DB/sender, produkčně podobná konfigurace |
| production | Nginx DMZ → Docker na `docker.home.cz` | DB přes `haproxy.home.cz:5000`, audit, alerty, backup |

Data ani secret se mezi prostředími nekopírují bez schváleného a bezpečného
postupu. Produkční osobní údaje se nepoužívají jako běžná testovací data.

## Konfigurace

`.env.example` a tato tabulka musí zůstat synchronizované. Prázdná hodnota
znamená, že konkrétní prostředí musí hodnotu dodat bezpečným kanálem.

| Název | Povinné | Výchozí | Secret | Účel |
| --- | --- | --- | --- | --- |
| `APP_ENV` | ano | `development` | ne | runtime prostředí |
| `APP_PORT` | ano | `3000` | ne | lokální/API port |
| `PUBLIC_APP_URL` | ano | `http://localhost:3000` | ne | kanonická veřejná URL a odkazy |
| `ADMIN_APP_URL` | ano | `http://localhost:3000/admin` | ne | povolený admin origin/deep links |
| `MOBILE_DEEP_LINK_SCHEME` | ano | `studiobalance` | ne | schéma mobilních deep linků |
| `DATABASE_URL` | runtime | prázdné | ano | lokálně Docker PostgreSQL; produkčně host `haproxy.home.cz`, port `5000` |
| `S3_ENDPOINT` | při použití médií | prázdné | podle URL | interní S3-kompatibilní endpoint schválené Studio Balance gateway |
| `S3_REGION` | při použití médií | prázdné | ne | region očekávaný S3 klientem/službou |
| `S3_BUCKET` | při použití médií | prázdné | ne | vyhrazený Studio Balance bucket, ne bucket jiného projektu |
| `S3_ACCESS_KEY_ID` | při použití médií | prázdné | ano | identifikátor dedikovaných credentials |
| `S3_SECRET_ACCESS_KEY` | při použití médií | prázdné | ano | tajná část dedikovaných credentials |
| `S3_FORCE_PATH_STYLE` | ne | `true` | ne | kompatibilita s lokální a SeaweedFS S3 implementací |
| `SESSION_SECRET` | runtime | prázdné | ano | podpis/šifrování relace dle architektury |
| `EMAIL_FROM` | runtime | prázdné | ne | ověřený odesílatel transakčních zpráv |
| `EMAIL_PROVIDER_API_KEY` | runtime | prázdné | ano | e-mail provider credential |
| `PUSH_PROVIDER_CREDENTIALS` | mobile runtime | prázdné | ano | serverová push credentials/reference |
| `LOG_LEVEL` | ne | `info` | ne | minimální úroveň logování |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | ne | prázdné | podle URL | cíl telemetrie |

Produkce nesmí startovat s vývojovým secretem, neplatnou veřejnou URL nebo
chybějící povinnou runtime závislostí. Konfigurační chyba má být konkrétní v
interním logu, ale nesmí vypsat hodnotu secretu.

## Externí závislosti

- PostgreSQL jako transakční zdroj pravdy;
- volitelné S3-kompatibilní úložiště binárních médií s odděleným tenantem;
- Nginx reverse proxy na `dmz.home.cz` pro internetovou publikaci;
- transakční e-mail;
- push infrastruktura pro iOS/Android;
- observability/error monitoring;
- DNS/TLS a případně queue runtime.

S3 je schválené jako volitelná schopnost, nikoli jako automaticky připravená
služba. Před použitím je nutné vytvořit vlastní gateway/bucket/credentials,
připnout image, doplnit healthcheck, vyřešit kapacitu hostitele a prokázat
backup/restore. Otevřené jsou PostgreSQL major/TLS/auth, Docker deployment,
registry, Nginx upstream/TLS konfigurace, poskytovatelé, ceny a limity. Žádná
platební služba není potřeba.

## Deployment kontrakt

Budoucí pipeline musí:

1. použít pinned/lockfile instalaci;
2. spustit lint, typecheck, testy, build, OpenAPI lint/diff a security scan;
3. vytvořit identifikovatelný immutable artefakt s verzí/commit SHA;
4. před nasazením ověřit zálohu a kompatibilitu migrace;
5. provést migraci bezpečným pořadím expand → deploy → contract;
6. nasadit Docker image API/worker/web na `docker.home.cz`, aktualizovat Nginx
   upstream na `dmz.home.cz` bezpečným postupem a ověřit `/health` a `/ready`;
7. provést smoke kritické anonymní a autentizované cesty;
8. sledovat error rate, latency a notification queue;
9. při aktivním S3 ověřit zápis/čtení testovacího objektu a stav zálohy bez
   zveřejnění originálu;
10. umožnit rollback aplikace bez ztráty nově zapsaných rezervací.

Mobilní release musí počítat se souběhem více verzí klienta. API změna je
zpětně kompatibilní po celé podporované mobilní rollout okno.

## Databázové migrace

- migrace jsou verzované a součástí repozitáře;
- produkční migrace neběží z vývojářského notebooku bez kontrolovaného postupu;
- produkční connection konfigurace i migrace používají schválený HAProxy
  endpoint, ne přímý PostgreSQL node;
- destruktivní změna používá etapizaci a předchozí backup;
- dlouhé locky na tabulce rezervací se testují na realistickém objemu;
- rollback aplikace se neplete s automatickým down migration, která by mohla
  smazat data;
- změna statusu nebo peněžního snapshotu má migrační a auditní plán.

## Health a readiness

- `GET /health`: 200, pokud proces běží; nekontroluje vzdálené služby;
- `GET /ready`: 200 jen pokud lze bezpečně obsloužit provoz; jinak 503;
- readiness minimálně zohlední DB a kritickou inicializaci. E-mail/push může
  degradovat asynchronně, pokud outbox bezpečně drží zprávy; přesné pravidlo se
  zafixuje implementací;
- S3 nedostupnost degraduje upload a media processing, ale nesmí zastavit
  čtení rozvrhu nebo rezervace; přesná media readiness politika se zafixuje
  implementací;
- response neobsahuje interní hostname ani credentials.

## Zálohování a obnova

Baseline:

- denní automatická záloha databáze;
- při použití S3 samostatná záloha/verzování binárních objektů, monitoring stáří
  a prokázaná konzistentní obnova s PostgreSQL metadata;
- šifrování a přístup nejmenších oprávnění;
- monitoring stáří a úspěchu zálohy;
- pravidelná obnova do izolovaného test prostředí;
- ověření počtů/konzistence users, sessions, bookings, fees a auditů;
- dokumentovaný vlastník a evidence posledního restore testu.

RPO, RTO a retence nejsou schválené a musí se uzavřít před produkcí.

## Provozní limity

Před spuštěním se stanoví: maximální interval veřejného rozvrhu, velikost a
rozměry uploadu, page size/export limit, rate limits, počet opakování série,
timeouty, retry policy e-mailu/push a maximální stáří mobilní offline cache.
Limity jsou serverové a dokumentované v API; nesmí se objevit náhodně v UI.

## Rollback

Rollback musí vrátit předchozí aplikační artefakt a kompatibilní konfiguraci,
ne přepsat databázi starou zálohou. Restore databáze je samostatný incidentní
postup jen pro poškození/ztrátu dat. Po rollbacku se ověří health/readiness,
zápis testovací rezervace v bezpečném prostředí, queue/outbox a stav migrací.

## Vlastnictví a předání

Studio Balance musí vlastnit nebo mít plný přístup k doméně, DNS, Nginx DMZ,
Docker hostu, GitHub repozitáři, databázi, případnému S3 bucketu/gateway,
e-mail senderu, push/mobile účtům, analytice a monitoringu. Předání obsahuje
účet/službu, vlastníka, fakturaci,
rotaci credentials, náklady, export a postup ukončení služby.

## Přesné příkazy k doplnění po scaffoldu

```text
install: TBD
run web/api/worker/mobile: TBD
build: TBD
test: TBD
lint: TBD
typecheck: TBD
database migrate/seed: TBD
Docker Desktop Compose: TBD
production Docker deploy to docker.home.cz: TBD
Nginx publish through dmz.home.cz: TBD
OpenAPI validate/generate: TBD
backup/restore test: TBD
S3 provision/backup/restore test: TBD
deploy/rollback: TBD
```

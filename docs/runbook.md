# Provozní runbook

## Jak runbook používat

Konkrétní provider a deployment příkazy nelze doplnit před volbou služeb a
vytvořením scaffoldu. Každý incident
začíná zaznamenáním času, prostředí, verze a request ID; chraňte osobní údaje a
nedělejte nevratnou databázovou opravu bez zálohy a auditu.

Obecné pořadí:

1. potvrdit dopad a zda je problém aktuální;
2. zastavit další škodu bezpečným omezením změnového provozu, je-li třeba;
3. ověřit poslední deploy/migraci a povinné závislosti;
4. korelovat log/trace/metric přes request ID;
5. zvolit rollback aplikace, opravu konfigurace nebo obnovu služby;
6. ověřit kritickou cestu a integritu dat;
7. zdokumentovat časovou osu, příčinu a follow-up.

## Aplikace se nespustí

**Příznaky:** proces restartuje, `/health` neodpovídá, runtime hlásí config nebo
migrační chybu.

**Diagnostika:** porovnat runtime verzi/artefakt, přítomnost povinných env names
bez vypsání hodnot, dostupnost portu, poslední migraci a první fatal log.

**Náprava:** opravit chybějící secret/config přes správný secret store; při
regresi vrátit poslední zdravý artefakt; migrační konflikt řešit podle
schváleného migration plánu, ne ručním mazáním tabulek.

**Ověření:** `/health` 200, `/ready` 200, start bez restart loopu, smoke veřejného
rozvrhu a bezpečná testovací cesta ve správném prostředí.

## API vrací 5xx

**Diagnostika:** request ID → log/trace; seskupit podle route template/error code,
verze a závislosti. Zkontrolovat 5xx rate, DB pool, deadlock/retry a poslední
deploy.

**Náprava:** provider timeout izolovat retry/circuit pravidlem; regresi
rollbacknout; při booking nejistotě nevyzývat klienta k opakování bez kontroly
uložené rezervace.

**Ověření:** error rate se vrátí k baseline, stejný request scénář projde,
`ErrorResponse` neuniká interní detail a data jsou konzistentní.

## Databáze není dostupná

**Příznaky:** `/ready` 503, booking/read operace selhávají, DB connect/pool alert
pro `haproxy.home.cz:5000`.

**Náprava:** ověřit HAProxy, DNS, credentials/TLS, pool a limity. Nepřepínat
aplikaci na přímý PostgreSQL node bez výslovného incidentního rozhodnutí
správce infrastruktury. Během výpadku nepřijímat rezervace do neautoritativní
cache. Po návratu zpracovat outbox a ověřit migrace.

**Ověření:** readiness 200, transakční smoke, counts/invariant dotazy bez orphan
fee/duplicit, queue se zmenšuje.

## Poslední místo / nejasný výsledek rezervace

**Příznaky:** klient dostal timeout, `SESSION_FULL` nebo se obává dvojí rezervace.

**Diagnostika:** podle klienta, session ID, idempotency key a request ID ověřit
právě jednu aktivní rezervaci; nezveřejnit seznam jiných klientů.

**Náprava:** pokud rezervace existuje, znovu bezpečně zobrazit/odeslat potvrzení.
Pokud neexistuje a termín je full, vysvětlit stav bez waitlistu. Nikdy ručně
nezvyšovat kapacitu jen kvůli technické chybě bez rozhodnutí admina.

**Ověření:** unique invariant, veřejný stav a klientský účet souhlasí.

## E-mail neodchází

**Diagnostika:** outbox/queue age, provider status, credentials, sender/domain,
rate limit, konkrétní job attempts. Rozlišit dočasné a permanentní chyby.

**Náprava:** obnovit provider/config, bezpečně retry idempotentní job. U
zrušení/změny s trvalým e-mail selháním vytvořit seznam dotčených klientů pro
oprávněný ruční kontakt; nepoužívat marketingový kanál bez souhlasu.

**Ověření:** backlog se zpracovává, stejná zpráva se neposlala nekontrolovaně
vícekrát, delivery stav a audit odpovídají.

## Nesprávný čas, cutoff nebo reminder

**Diagnostika:** zkontrolovat session local time, timezone, uložený UTC instant,
cutoff, arrival a timezone runtime. Porovnat před/po změně termínu a DST.

**Náprava:** nejprve zastavit automatické chybné joby; opravu dat provést
verzovaným skriptem/migrací s preview a auditním záznamem. Dotčené klienty
informovat schváleným provozním postupem.

**Ověření:** přesné boundary testy, pending reminder instants a zobrazení webu,
klientského účtu i e-mailu souhlasí.

## Média nebo obrazová delivery vrstva selhává

**Diagnostika:** metadata/reference v PostgreSQL, dostupnost S3 gateway a
bucketu, credential/permission chyby, volná kapacita, delivery/cache vrstva,
transform queue a content type. Secret hodnoty se nevypisují.

**Náprava:** zachovat funkční textový obsah a rozvrh; dočasně použít schválený
placeholder, ne náhodný/neschválený obraz. Opravit pipeline a znovu vytvořit
varianty z chráněného originálu.

**Ověření:** správný asset, crop, alt a cache headers; žádný privátní originál
nebyl zveřejněn.

Při zaplnění S3 nebo hostitelského disku se nejprve zastaví nové uploady a
transformace. Aktivní objekty, volumes ani images se nemažou bez inventury,
potvrzené retence a rozhodnutí správce infrastruktury. Rezervace a textový
obsah musí zůstat funkční.

## Vysoká latence nebo vyčerpání CPU/RAM

**Diagnostika:** p95/p99 podle route, saturation, DB slow queries, N+1, cache,
image transform a queue workload; porovnat verzi/deploy.

**Náprava:** rollback regrese, omezit nákladný export/upload, škálovat podle
schváleného modelu a odstranit příčinu. Neobejít transakční booking pravidla
cacheováním potvrzení.

**Ověření:** latency/saturation baseline a booking concurrency test.

## Neplatná konfigurace nebo uniklý secret

Při neplatné konfiguraci opravit hodnotu v řízeném secret/config zdroji,
restartovat/rollout a ověřit bez vypsání secretu. Při podezření na únik okamžitě
zneplatnit a rotovat credential, prohledat log/build/repo, určit rozsah a spustit
bezpečnostní incident proces. Pouhé smazání secretu z posledního commitu nestačí.

## Rollback po vadném release

1. zmrazit další rollout a zaznamenat vadnou/zdravou verzi;
2. ověřit, zda migrace je backward-compatible;
3. nasadit poslední zdravý immutable Docker image na `docker.home.cz` a ověřit
   Nginx upstream z `dmz.home.cz`;
4. neprovádět automatický DB restore;
5. ověřit health/readiness, rozvrh, auth, booking smoke a queue;
6. monitorovat error/latency a nově zapisovaná data;
7. otevřít follow-up pro forward fix a případnou datovou opravu.

## Obnova databáze

Restore je určen pro ztrátu/poškození dat, ne běžný rollback. Vyžaduje schválení
incident ownera, určení recovery pointu, izolované ověření backupu, plán pro
zápisy vzniklé po recovery pointu, audit a následnou integritní kontrolu. Přesné
provider příkazy se doplní před produkcí.

## Obnova médií ze S3

Obnova médií vyžaduje vybraný recovery point, izolovanou obnovu objektů,
kontrolu vazeb na PostgreSQL metadata a ověření, že privátní originály nezískaly
veřejná oprávnění. Databázová a S3 obnova se nesmějí považovat za nezávisle
hotové, dokud neprojde kontrola chybějících a osiřelých objektů.

## Eskalace

Jmenné kontakty, on-call kanál, P1/P2 reakční doby a provider support odkazy jsou
TBD a blokují produkční readiness. Produktový owner rozhoduje o komunikaci
klientům; technický incident owner řídí nápravu a evidenci.

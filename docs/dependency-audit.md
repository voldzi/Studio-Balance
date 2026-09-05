# Audit a aktualizace knihoven — 2026-09-05

Rozsah: npm závislosti všech sedmi workspace projektů, lockfile a bezpečnostní
kontrola v CI. Audit balíčků není penetrační test ani audit operačního systému,
kontejnerových obrazů nebo sdíleného Keycloaku.

## Výsledek

Před aktualizací `pnpm audit --json` hlásil 19 nálezů: 1 kritický,
13 vysokých, 4 střední a 1 nízký. Po aktualizaci hlásí **0 nálezů** ve všech
kategoriích, včetně vývojových závislostí. Jde o stav databáze upozornění
v okamžiku kontroly, nikoli záruku neexistence dalších chyb.

Aktualizovány jsou přímé knihovny i povolené nepřímé závislosti. Odstraněny
byly staré výjimky minimálního stáří vydání. Fastify a find-my-way zůstávají
sjednocené pomocí overrides na 5.12.3 a 9.9.0. Dočasný cílený override nanoid
3.x na 3.3.18 opravuje zranitelnou verzi připnutou PostCSS; odstranit ho lze,
až upstream sám vybere opravenou verzi. CI nově spouští
`pnpm audit --audit-level=high` po instalaci a blokuje vysoké i kritické nálezy.

## Přímé aktualizace

| Knihovna | Před | Po |
|---|---|---|
| @next/eslint-plugin-next | 16.3.0 | 16.3.4 |
| @types/react-dom | 19.2.4 | 19.2.7 |
| next | 16.3.0 | 16.3.4 |
| tsx | 4.23.5 | 4.23.13 |
| @aws-sdk/client-s3 | 3.916.0 | 3.1126.0 |
| @types/node | 26.1.2 | 26.4.1 |
| @types/pg | 8.20.3 | 8.23.1 |
| eslint | 10.8.0 | 10.10.0 |
| fastify | 5.11.2 | 5.12.3 |
| jose | 6.1.3 | 6.2.11 |
| pg | 8.22.0 | 8.23.0 |
| react-icons | 5.5.0 | 5.7.0 |
| typescript-eslint | 8.66.0 | 8.69.0 |
| zod | 4.4.3 | 4.5.4 |
| @nestjs/common | 11.1.28 | 11.2.3 |
| @nestjs/core | 11.1.28 | 11.2.3 |
| @nestjs/platform-fastify | 11.1.28 | 11.2.3 |
| @nestjs/testing | 11.1.28 | 11.2.3 |
| vitest | 4.1.10 | 4.1.11 |
| sharp | 0.35.3 | 0.35.4 |

## Vědomě ponechané hlavní řady

NestJS 11.2.3, TypeScript 5.9.3 a Vitest 4.1.11 zůstávají ve stávajících
hlavních řadách. Registr nabízí NestJS 12.0.1, TypeScript 7.0.2 a Vitest 5.0.0;
jejich migrace není součástí této kompatibilní bezpečnostní aktualizace.
Vyžaduje samostatné posouzení změn kompilátoru, frameworku a testovacího prostředí.
Oficiální průvodce NestJS: https://docs.nestjs.com/migration-guide.
React a ostatní nezměněné přímé knihovny již odpovídaly aktuální stabilní verzi
registru (s výjimkou výše uvedených hlavních migrací).

## Ověření

- `pnpm check`: lint, typová kontrola, 85 testů, produkční sestavení a validace
  repozitáře, tématu Keycloak a OpenAPI prošly.
- Devět databázových testů vynechaných standardní sadou bylo zahrnuto do
  samostatné místní integrační kontroly: 14 testů ve 4 souborech prošlo.
- `pnpm audit --json`: nula nálezů po konečné instalaci.
- Vizuální kontrola v prohlížeči ani sestavení Docker obrazů v tomto auditu
  nebyly provedeny. Aplikační zdrojový kód a API kontrakt se nemění.

## Nasazení

Revize `a92bdb1` byla 2026-09-05 nasazena do produkce. API readiness potvrzuje
tuto revizi; API, web a worker jsou healthy. Veřejné API potvrzuje zavřený stav.
Před nasazením byla po souhlasu uživatele odstraněna nepoužívaná Docker build
cache (celkem přibližně 2,9 GB); obrazy, kontejnery a datové svazky zůstaly zachované.
Origin HTML nově vrací private/no-store. Běžná veřejná domovská URL ještě
vrací starou CDN kopii ze 4. září; je nutné vyčistit cache ve WEDOS administraci.

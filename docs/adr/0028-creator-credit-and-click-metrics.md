# ADR 0028 — Autorská patička a explicitní metriky odkazů

Status: accepted, 2026-10-09 (CD-070); centrální realizace se koordinuje s VCode.

## Context

Veřejné stránky neměly autorský podpis. Současné obecné `outbound-click`
neumožňuje rozlišit účinnost tří nových autorských odkazů.

## Decision

Přidat nenápadný veřejný podpis VCode se dvěma aplikacemi Moje porce a Městem
hrou, oficiálními lokálními ikonami a třemi pevnými HTTPS odkazy. Žádná změna
klientské spodní navigace nebo správy partnerských aplikací.

Centrální VCode dodá společný verzovaný kontrakt a prověřený runtime pro
rozlišení explicitních kliknutí na tři pevné cíle. Neposílat cílové adresy,
texty, identifikátory účtů ani parametry. Zachovat původní povolené veřejné
cesty, neautomatický sběr, DNT/GPC, offline discard a potlačení při obou
aplikačních cookies. Stávající masáže a sociální odkazy zůstanou kompatibilní.

Rozsah byl schválen přímo vlastníkem. Přesné názvy událostí, runtime/SRI a
ověření centrálního příjmu se uvedou v analytické integraci. Lokální runtime
fork ani rozšíření sběru v soukromých částech není dovoleno.

Dodávka VCode: `public-v2-portfolio.js`, `vcode-public-v2` /
`runtimeRevision=portfolio-1`; lokální přesná kopie
`/vcode-analytics-portfolio-v1.js`. Události jsou `portfolio-vcode-click`,
`portfolio-moje-porce-click`, `portfolio-mestem-hrou-click`. Každý autorský
odkaz odesílá jen svou událost bez dalšího obecného outbound-click. Centrální
gate `portfolioMetricsApprovedAt` a per-site allowlist se aktivují po
ověření zveřejněného pátého odstavce CS/EN. Dosavadní TikTok zdroje zůstávají
kompatibilní; předchozí asset se ponechává beze změny.

## Consequences

Lokální statické ikony nevyžadují cizí obrazové servery ani novou závislost.
Metriky vyjadřují anonymní zájem o odkaz, nikoli registraci nebo používání
jiné aplikace. Selhání statistiky nesmí bránit otevření odkazu ani rezervaci.

## Validation

360 px, klávesnice, kontrast, ikonové popisky, přesné odkazy; tři odlišné
události, zachovaná starší událost a odmítnutí libovolných názvů/privátních
cest; přesné SRI a běh společného runtime v izolovaném přijímači.

# Dokumentace Studio Balance

Tato složka obsahuje aktivní dokumentaci pro vývoj. Původní podklady
zadavatele zůstávají beze změny v `docs/01 Zadání/`; historické nebo nahrazené
vývojové dokumenty patří do `docs/archive/`.

## Autorita dokumentů

Pozdější výslovná rozhodnutí v `client-decisions.md` mají v měněném tématu
přednost před původním briefem. Odvozené dokumenty rozdělují oba zdroje podle
témat a doplňují technické návrhy, ale samy nemění rozsah. Nevyřešený rozpor se
zapíše do `open-questions.md` a vyřeší před implementací.

## Aktivní sada

| Dokument | Kanonické téma | Stav |
| --- | --- | --- |
| `client-decisions.md` | závazné změny zadavatele po původním briefu | závazné |
| `requirements.md` | rozsah, obchodní pravidla, priority a invarianty | výchozí baseline |
| `product-design.md` | uživatelé, cesty, obrazovky, design systém a UX stavy | výchozí baseline |
| `architecture.md` | hranice systému, komponenty, data, integrace a nasazení | schválený směr |
| `api.md` | lidsky čitelný popis REST API a kontraktních pravidel | návrh |
| `security.md` | autentizace, oprávnění, soukromí a bezpečnostní minimum | baseline |
| `operations.md` | konfigurace, prostředí, zálohy, nasazení a rollback | před implementací |
| `observability.md` | logy, metriky, trace, health a alerty | před implementací |
| `runbook.md` | provozní incidenty a ověření nápravy | před implementací |
| `testing.md` | testovací vrstvy, kritické scénáře a release gate | baseline |
| `client-questionnaire-booking-rules.md` | připravený dotaz k odloženým rezervačním pravidlům | čeká na odeslání |
| `infrastructure-assessment.md` | inventura hostitele, využitelné služby a readiness podmínky | ověřeno 2026-08-04 |
| `delivery-plan.md` | etapy, závislosti, výstupy a vstupní/výstupní brány | návrh |
| `open-questions.md` | neuzavřená produktová a technická rozhodnutí | živý registr |
| `source-register.md` | evidence, priorita a interpretace vstupních podkladů | ověřeno 2026-08-04 |
| `adr/` | architektonická rozhodnutí a jejich historie | živý registr |

Strojovým zdrojem API je `openapi/openapi.json`. V počáteční fázi obsahuje jen
platformní health/readiness kontrakt; funkční endpoint se nestává schváleným
jen tím, že je zmíněn v návrhu `api.md`.

## Pravidla údržby

- Jedno téma má jeden aktivní kanonický dokument.
- Změna chování aktualizuje ve stejném kroku požadavky, API, testy a dotčené
  bezpečnostní, produktové nebo provozní dokumenty.
- Významné rozhodnutí dostane nové ADR; staré ADR se nepřepisuje, ale nahrazuje.
- Návrh se nesmí prezentovat jako rozhodnutí. Používejte stavy `Proposed`,
  `Accepted`, `Superseded` nebo `Rejected`.
- Původní podklady zadavatele se neupravují ani nepřesouvají.
- Kontrola kostry: `bash scripts/validate-skeleton.sh`.

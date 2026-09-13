# Design QA — klientská webová aplikace

## Vizuální podklady

- Schválený směr: `/Users/voldzi/.codex/generated_images/019fcd46-91be-7603-84cb-30fcc6f9ef9b/exec-c2f2dcde-c017-4468-8454-a9636520f3df.png`
- Doplňující reference zadavatelky: `WhatsApp Image 2026-08-13 at 10.20.27.jpeg` a `WhatsApp Image 2026-08-13 at 10.52.51.jpeg`
- Porovnání reference a implementace: `output/design-qa/mobile-reference-comparison.png`

## Ověřené stavy

- Přihlášená klientka s nejbližší rezervací a možností jejího zrušení.
- Mobilní zobrazení 390 × 844 px a desktopové zobrazení 1280 px.
- Spodní navigace Domů, Rozvrh, Rezervace, Oblíbené a Profil.
- Prázdné stavy oblíbených lekcí a novinek bez vymyšleného obsahu.
- Viditelné zaměření ovládacích prvků, klávesnicová obsluha a dotykové cíle.
- Skutečné fotografie lekcí, jednotná barevnost a typografie Studio Balance.
- Veřejné rozhraní neukazuje číselnou kapacitu ani počet volných míst.

## Výsledek

Implementace odpovídá schválenému směru; odchylky jsou omezené na skutečný počet testovacích rezervací a použití dodaných fotografií místo ilustračního obsahu reference.

final result: passed

---

# Design QA — partnerské doporučení Masáží Jiřina

- Source visual: `output/proposals/studio-balance-partnerske-doporuceni-masaze-jirina.png` (1600 × 1200 px)
- Implementation: `http://localhost:3000/`
- Implementation screenshots: captured and inspected in the Codex in-app browser; the browser tool did not emit a filesystem path
- Viewports: default desktop 1280 × 720 px and mobile 390 × 844 px plus the supported minimum width of 360 px
- Checked: 2026-09-13

## Comparison

| Area | Result |
| --- | --- |
| Placement | Matches the approved hierarchy: after reviews and before the contact footer. |
| Layout | Desktop uses image-left/copy-right; mobile stacks the image above the copy. No clipping or horizontal overflow was observed. |
| Typography and colour | Uses the existing Studio Balance display/body fonts, warm neutral card, copper eyebrow and primary CTA from the approved direction. |
| Copy | Eyebrow, heading, description and CTA match the approved Czech wording. |
| Photography | The illustrative proposal image was intentionally replaced by the official public Masáže Jiřina image. The image preserves its proportions and has a calm crop at both viewports. |
| Accessibility | Semantic labelled section, descriptive image alt, visible keyboard focus inherited from the site, 44 px-plus CTA target and an accessible link name that announces the destination site. |
| Interaction | CTA was activated in the in-app browser and reached `https://masaze.zeleznalady.cz/` in the same tab. |

No P0, P1 or P2 visual mismatch remains.

Final result: passed

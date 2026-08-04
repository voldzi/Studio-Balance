# Design QA – zákaznické preview

**Srovnávaný stav**

- Zdrojová vizuální pravda: `docs/01 Zadání/WhatsApp Image 2026-08-04 at 16.29.09 (1).jpeg`.
- Implementace – úvod: `artifacts/design-qa/home-desktop-1536x1024.png`.
- Implementace – rozvrh: `artifacts/design-qa/schedule-desktop-1536x1024.png`.
- Mobilní důkazy: `artifacts/design-qa/home-mobile-390x844.png` a `artifacts/design-qa/schedule-mobile-390x844.png`.
- Desktop viewport a screenshot: 1536 × 1024 CSS px, 1536 × 1024 obrazových px, device scale 1.
- Mobilní viewport a screenshot: 390 × 844 CSS px, 390 × 844 obrazových px, device scale 1.
- Zdroj: 1536 × 1024 obrazových px. Jde o kompozitní design board, nikoli jeden přesný browser viewport; desktopové oblasti byly proto porovnávány obsahově a ve stejné 1536 × 1024 ploše bez změny hustoty.
- Stav: anonymní návštěvník, světlé téma, úvodní stránka nahoře; rozvrh se zvoleným prvním dnem.

**Findings**

- Žádný akční nález P0, P1 ani P2 nezůstal.
- Typografie: velké serifové nadpisy, kompaktní sans-serif navigace, váhy, řádkování a hierarchie odpovídají návrhu. Produkční font soubor nebyl dodán; použitý systémový serif je přijatelná preview náhrada.
- Rozestupy a rytmus: hero, obsahové sekce, rozvrhové řádky, akční prvky a rádiusy drží klidnou hustotu návrhu. Mobil 390 px nemá horizontální přetečení; ověřený `scrollWidth` se rovná viewportu.
- Barvy a tokeny: krémové plochy, hnědý text, měděný akcent a tlumená zelená dostupnosti jsou konzistentní a kontrastní. Stav dostupnosti nepoužívá počet míst.
- Obrazová kvalita: preview používá rasterové logo a fotografie přímo dodané zadavatelem, se zachovaným poměrem stran a řízeným ořezem. Žádný obrazový prvek nebyl nahrazen CSS kresbou, vlastním SVG nebo zástupným symbolem.
- Copy: texty jsou samostatně srozumitelné, drží klidný tón značky a neobsahují platbu, waitlist, permanentku ani číselnou kapacitu.
- Interakce a stavy: funguje navigace, přepínání dnů, detail termínu a návrat do přihlášení se zachovaným cílem rezervace. Veřejný rozvrh zůstává anonymně dostupný.
- Přístupnost: sémantické nadpisy, `tablist`/`tabpanel`, odkazy, alternativní texty, viditelný fokus a mobilní dotykové cíle jsou přítomné. Kritické ovládání není překryté ani uříznuté.

**Open Questions**

- P3: návrh obsahuje šest samostatných fotografií lekcí, ale zadavatel dodal jejich náhled pouze jako součást koláže. Preview proto používá dvě samostatně dodané fotografie studia s různými bezpečnými ořezy. Pro finální obsah jsou potřeba jednotlivé originály.
- P3: hlavička je kvůli čitelnosti dodaného rastrového loga nad hero fotografií, zatímco koncept ji překrývá. Finální průhledné SVG/PNG umožní přesnější overlay variantu.
- Zobrazené počty volných míst z konceptu byly záměrně vynechány podle závazného produktového pravidla; nejde o designovou chybu.

**Implementation Checklist**

- [x] Použít klientské logo a fotografie v úvodu a kartách.
- [x] Zachovat barevnost, typografickou hierarchii a vizuální klid návrhu.
- [x] Ověřit desktop 1536 × 1024 a mobil 390 × 844.
- [x] Ověřit rozvrh, přepínání dne, detail termínu a chráněný vstup do rezervace.
- [x] Nezobrazovat kapacitu, počet míst, waitlist ani online platbu.

**Comparison History**

- První render odhalil pouze vývojový indikátor Next.js překrývající mobilní obsah a historické LCP upozornění. Indikátor byl vypnut, hlavní obrázek dostal eager načtení a snímky byly znovu pořízeny.
- Kontrola pravidel assetů odhalila dekorativní CSS texturu a gradientní překryvy. Byly nahrazeny čistými barevnými plochami; finální desktop a mobil byly znovu zachyceny.
- Post-fix důkaz: finální zdrojový board a `home-desktop-1536x1024.png` byly otevřeny společně v jednom porovnání; totéž bylo provedeno pro `schedule-desktop-1536x1024.png`. Žádný P0/P1/P2 rozdíl nezůstal.

**Focused Region Evidence**

- Hero byl posouzen ve skutečné velikosti 1536 × 1024 kvůli logu, řezu fotografie, nadpisu a CTA.
- Rozvrh byl posouzen samostatným desktopovým snímkem kvůli datovým záložkám, řádkům, cenám, stavům a absenci číselné kapacity.
- Mobilní úvod a rozvrh byly posouzeny samostatnými 390 × 844 snímky; další crop nebyl potřeba, protože texty a ovládací prvky jsou v této hustotě čitelné.

**Browser Verification**

- Ověřené cesty: `/`, `/rozvrh`, `/rozvrh/{sessionId}`, `/rezervace/{sessionId}` a návrat na `/prihlaseni?returnTo=...`.
- Ověřené interakce: výběr dne, detail lekce a ochrana rezervace bez relace.
- Konzole: žádná runtime chyba. Starší vývojové LCP upozornění bylo opraveno; opakovaný render má hlavní obrázek s `loading="eager"`.

final result: passed

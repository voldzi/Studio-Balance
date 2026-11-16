# ADR 0034 — Vzhled webu jako spravovaný obsah

Datum 2026-11-16, schváleno CD-076. Rozšiřuje ADR 0033.

Přidání loga, povolené palety a pořadí známých sekcí rozšiřuje revizi výběru
fotek. Stejný revizní zámek a transakce chrání celou publikaci před souběžným
přepsáním. Stávající klient může poslat původní data bez pole appearance.
Samotná změna vzhledu nenahrazuje výchozí galerii. Pozice závisí na pevných
identifikátorech a vyžaduje úplnou permutaci. HTML ani uživatelské CSS se
neukládají. Barvy a výchozí pořadí jsou součástí aplikace.

Logo sdílí admin upload, normalizaci a vyhrazený mediální prostor fotek.
Nahrané logo je do zveřejnění dostupné pouze správci. Veřejný výstup čte
zveřejněnou revizi a při výpadku API použije výchozí značku, pořadí a fotky.
Ostatní fotky dostupné jen jako koncept, skryté fotky bez umístění a
nahrazené logo zůstávají v privátním úložišti. Výměna se netýká ikon instalované
aplikace nebo značky v přihlašování Keycloak. Náhled ukazuje logo, barvy,
pořadí a fotky v mobilní a širší kompozici; zkracuje dynamický obsah.

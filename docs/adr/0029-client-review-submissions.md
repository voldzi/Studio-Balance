# ADR 0029 — Klientské recenze a moderace

Status: accepted, 2026-10-10 (CD-072).

## Context

CD-018 umožňovalo pouze ručně spravované reference. Provozovatelka potřebuje,
aby klienti mohli napsat recenzi z domova i přímo ve studiu, bez přepisování
správcem a bez automatické publikace spamu nebo osobních údajů.

## Decision

Přidat anonymní formulář `/recenze/napsat`, odkaz z homepage/Recenzí a
neindexovanou tiskovou stránku `/recenze/qr` s lokálním QR assetem. QR odkazuje
na tentýž veřejný formulář bez označování místa vzniku recenze. Není nutný
účet, e-mail ani externí poskytovatel. VCode analytika zůstává na dosavadních
přesných cestách a událostech; nové stránky, formulář a jeho pole se nesledují.

Veřejné API vydá výzvu s účelem odděleným od autentizace, podepsanou existujícím
serverovým `SESSION_SECRET`. Platí 30 minut a při odeslání musí být alespoň
2 sekundy stará. POST vyžaduje JSON, přesný origin z `PUBLIC_APP_URL`, prázdný
honeypot a explicitní souhlas s aktuální verzí textu. Browser používá
`credentials: omit`. Úspěch vrací pouze `202 {"status":"pending"}` bez
identifikátoru nebo znovu zaslaných osobních údajů.

PostgreSQL uchová původní jméno/iniciály, text, volitelné hodnocení, souhlas,
nonce a obsahový otisk pro idempotenci, stav moderace a vazbu na publikovanou
recenzi. Stejná výzva a stejný obsah při opakování nevytvoří druhý záznam;
změněný obsah se stejnou výzvou skončí 409. Souběh limitů i publikace je
transakční. Limit je 30 přijatých recenzí na normalizovanou síť za klouzavých
60 minut a 200 globálně za stejný interval. IPv4 se normalizuje na /24 a IPv6 na
/56, před uložením se převede účelově odděleným HMAC na krátkodobý otisk;
neukládá se původní IP ani síť. Technické záznamy přijatých odeslání expirují po
2 hodinách; stávající worker je každých 10 minut smaže v dávce do 500 řádků,
i bez nových odeslání. Úklid zároveň doplňuje nový přijatý návrh.
Omezení může zasáhnout společnou síť a není zárukou ochrany před odhodlaným
útočníkem; při zahlcení se vrací 429, nikoli tiché přijetí.

Administrátor s rolí a MFA vidí nejvýše 100 návrhů vybraného stavu, pending
od nejstaršího. Schválení transakčně založí právě jednu běžnou publikovanou
recenzi se zdrojem `Web studia`, původním obsahem a zaznamenaným souhlasem.
Zvýraznění je samostatná explicitní volba. Odmítnutí vyžaduje důvod.
Opakování stejného rozhodnutí je idempotentní; protichůdné rozhodnutí je 409.
Audit zaznamenává aktéra, rozhodnutí a ID, nikoli celý obsah recenze.

Původní jméno, text a hodnocení klientské recenze chrání také stávající
administrační editace. Správce smí měnit viditelnost, zvýraznění a pořadí,
nikoli vydávat přepsaný text za původní klientskou zkušenost. Recenze bez
ověření návštěvy nesmí být označena za ověřenou. Negativní názor sám o sobě
není důvodem odmítnutí. Žádost o stažení souhlasu řeší studio přes zveřejněný
kontakt; anonymní endpoint na mazání podle odhadnutého ID nevzniká.

## Consequences

Textová recenze nepotřebuje S3 ani nový secret. Nová migrace přidává tabulky
bez změny rezervací, uživatelů nebo stávajících referencí; rollback obrazu
ponechá nové návrhy neveřejné v databázi. Neprovádět destruktivní down migraci.
Evidence souhlasů, recenzí a auditu nemá automatické mazání bez samostatně
schválené retenční politiky. Retence 2 hodiny se vztahuje jen na technické
počítadlo, ne na klientské návrhy nebo audit. Není zde příslib Google hodnocení,
vyhodnocení návštěvy, e-mailového potvrzení ani automatického SEO přínosu.

## Validation

API kontrakt, anonymní/role/MFA denial-first testy, souhlas a validační limity,
podpis/účel/expirace výzvy, přesný Origin, honeypot, rate-limit souběh,
idempotence odeslání, paralelní schválení a atomický audit. UI ověřit od
360 px, klávesnicí, bez hvězdiček, při chybě i expiraci přihlášení. Před
publikováním ověřit nulové události na obou nových cestách a QR návrat na
stejný formulář bez doteku skutečných referencí.

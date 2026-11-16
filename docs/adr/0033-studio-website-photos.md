# ADR 0033: Fotografický obsah studia

Přijato 2026-11-16 (CD-075).

Tři veřejné plochy sdílejí publikovaný výběr v PostgreSQL. Seznam do 40
položek podporuje nezávislé zařazení do galerie a použití na úvodní
stránce či O studiu. Změny v editoru zůstávají v této kartě do zveřejnění.
Publikace je atomická a obsahová revize chrání před přepsáním změn kolegy.

Nahrání používá existující proces normalizace a vyhrazený S3 bucket;
namespace studio-website odděluje soukromé náhledy od ostatních kategorií
médií. Veřejná trasa vydá pouze publikovaný obrázek (titulní nebo galerijní).
Odebrání položky z výběru nemaže objekt z úložiště. Retence archivních
snímků ani pravidla pro mazání médií se nemění.

Do prvního zveřejnění zůstane původní galerie. První zveřejnění ji jako
celek přepne na spravovaný obsah; i prázdná spravovaná galerie zůstane
prázdná. Nevybrané hlavní fotografie a krátká nedostupnost API používají
bundlovanou náhradu. Po návratu na předchozí release se vrátí původní pohled;
data nové funkce zůstávají pro další nasazení.

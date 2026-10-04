import { publicAnalyticsConfig } from "../lib/public-analytics";

// Owner-review draft. This renders nothing until the complete notice is approved.
export function PublicAnalyticsNotice() {
  if (!publicAnalyticsConfig.privacyNoticeApproved) return null;
  return <section className="section" aria-labelledby="public-analytics-privacy-title">
    <h2 id="public-analytics-privacy-title">Soukromí a statistika návštěvnosti</h2>
    <p>Na obecných veřejných stránkách Studia Balance používáme vlastní statistiku návštěvnosti, abychom lépe rozuměli využití webu. Evidujeme pouze otevření předem vybraných veřejných stránek. Nepoužíváme analytické cookies, nesledujeme kliknutí ani nenahráváme obrazovku.</p>
    <p>Do statistik neposíláme obsah formulářů, rezervace, účet, e-mail, jméno, polohu, zdravotní údaje, parametry adresy ani odkaz předchozí stránky. Přihlášené návštěvy a soukromé části aplikace neměříme. Respektujeme nastavení Do Not Track a Global Privacy Control; při jejich zapnutí se měření neodesílá. Návštěvy bez připojení neukládáme pro pozdější odeslání.</p>
    <p>Statistiky zpracovává společná služba v naší infrastruktuře. Při přijetí požadavku server technicky obdrží síťovou adresu zařízení; ta se nepřipojuje k vašemu účtu. Statistické záznamy uchováváme nejvýše 180 dní a přístup mají pouze oprávněné osoby. Odhad návštěvnosti nepředstavuje přesný počet konkrétních lidí.</p>
  </section>;
}

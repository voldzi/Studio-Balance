import Link from "next/link";

import { SocialLinks } from "./social-links";

export function SiteFooter() {
  return <footer>
    <div className="footer-brand"><p>Studio Balance</p><p>Najdi si svůj balanc.</p></div>
    <div><h2>Rezervace</h2><Link href="/rozvrh">Rozvrh lekcí</Link><Link href="/muj-ucet">Můj účet</Link></div>
    <div><h2>Kontakt</h2><p>Ruská 10, 792 01 Bruntál</p><Link href="/kontakt">Kontaktní informace</Link><SocialLinks compact /></div>
  </footer>;
}

import Image from "next/image";
import Link from "next/link";

import { SiteHeader } from "./site-header";

export function ContentPage({ children, eyebrow, image, imageAlt, title }: { children: React.ReactNode; eyebrow: string; image?: string; imageAlt?: string; title: string }) {
  return <><SiteHeader /><main className="content-shell"><header className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></header>{image && <div className="content-hero-image"><Image alt={imageAlt ?? "Studio Balance"} fill priority sizes="(max-width: 760px) 100vw, 1180px" src={image} /></div>}<div className="content-prose">{children}</div></main><footer><div className="footer-brand"><p>Studio Balance</p><p>Najdi si svůj balans.</p></div><div><h2>Rezervace</h2><Link href="/rozvrh">Rozvrh lekcí</Link><Link href="/muj-ucet">Můj účet</Link></div><div><h2>Kontakt</h2><p>Ruská 10, 792 01 Bruntál</p><Link href="/kontakt">Kontaktní informace</Link></div></footer></>;
}

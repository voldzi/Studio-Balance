import Image from "next/image";
import Link from "next/link";

import type { PublicAnalyticsClickName } from "../lib/public-analytics-v2";
import { PublicAnalyticsLink } from "./public-analytics-link";
import { SocialLinks } from "./social-links";

type CreatorLinkProps = {
  name: string;
  href: string;
  icon: string;
  analyticsEvent: PublicAnalyticsClickName;
};

function CreatorLink({ name, href, icon, analyticsEvent }: CreatorLinkProps) {
  return <PublicAnalyticsLink className="footer-credit-link" href={href} target="_blank" rel="noopener noreferrer" analyticsEvent={analyticsEvent}>
    <Image src={icon} width={32} height={32} alt="" aria-hidden="true" unoptimized />
    <span>{name}</span><span className="sr-only"> (otevře se v nové kartě)</span>
  </PublicAnalyticsLink>;
}

export function CreatorCredits() {
  return <section className="footer-credits" aria-label="Autor webu a další aplikace">
    <p>Web a rezervační systém vytvořilo{" "}<CreatorLink name="VCode" href="https://vcode.zeleznalady.cz/" icon="/images/creators/vcode-af0610b52c23.svg" analyticsEvent="portfolio-vcode-click" />.</p>
    <p>Od stejného týmu také aplikace{" "}<CreatorLink name="Moje porce" href="https://mojeporce.cz/" icon="/images/creators/moje-porce-b244faa9e68a.svg" analyticsEvent="portfolio-moje-porce-click" />{" "}a{" "}<CreatorLink name="Městem hrou" href="https://mestemhrou.cz/" icon="/images/creators/mestem-hrou-e40bec4cb730.png" analyticsEvent="portfolio-mestem-hrou-click" />.</p>
  </section>;
}

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-brand"><p>Studio Balance</p><p>Najdi si svůj balanc.</p></div>
    <div><h2>Rezervace</h2><Link href="/rozvrh">Rozvrh lekcí</Link><Link href="/muj-ucet">Můj účet</Link></div>
    <div><h2>Kontakt</h2><p>Ruská 10, 792 01 Bruntál</p><Link href="/kontakt">Kontaktní informace</Link><SocialLinks compact /></div>
    <CreatorCredits />
  </footer>;
}

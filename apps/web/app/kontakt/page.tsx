import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "../../components/content-page";
import { SocialLinks } from "../../components/social-links";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/kontakt", title: "Kontakt a adresa", description: "Studio Balance najdete na adrese Ruská 10, 792 01 Bruntál. Prohlédněte si kontaktní informace a sociální sítě studia." });
export default function ContactPage() { return <ContentPage eyebrow="Studio Balance" title="Kontakt"><p><strong>Studio Balance</strong><br />Ruská 10<br />792 01 Bruntál</p><p>Pro rezervaci si vyberte konkrétní termín v rozvrhu. Telefon, e-mail a mapu doplníme po konečném ověření zadavatelkou.</p><section className="contact-socials" aria-labelledby="contact-socials-title"><h2 id="contact-socials-title">Sledujte Studio Balance</h2><p>Novinky ze studia a aktuální inspiraci najdete na našich sociálních sítích.</p><SocialLinks /></section><Link className="button" href="/rozvrh">Přejít na rozvrh</Link></ContentPage>; }

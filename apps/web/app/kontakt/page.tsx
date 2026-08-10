import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "../../components/content-page";
import { SocialLinks } from "../../components/social-links";

export const metadata: Metadata = { title: "Kontakt", description: "Kontakt a cesta do Studia Balance v Bruntále." };
export default function ContactPage() { return <ContentPage eyebrow="Studio Balance" title="Kontakt"><p><strong>Studio Balance</strong><br />Ruská 10<br />792 01 Bruntál</p><p>Pro rezervaci si vyberte konkrétní termín v rozvrhu. Telefon, e-mail a mapu doplníme po konečném ověření zadavatelkou.</p><section className="contact-socials" aria-labelledby="contact-socials-title"><h2 id="contact-socials-title">Sledujte Studio Balance</h2><p>Novinky ze studia a aktuální inspiraci najdete na našich sociálních sítích.</p><SocialLinks /></section><Link className="button" href="/rozvrh">Přejít na rozvrh</Link></ContentPage>; }

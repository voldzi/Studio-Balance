import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "../../components/content-page";

export const metadata: Metadata = { title: "Kontakt", description: "Kontakt a cesta do Studia Balance v Bruntále." };
export default function ContactPage() { return <ContentPage eyebrow="Studio Balance" title="Kontakt"><p><strong>Studio Balance</strong><br />Ruská 10<br />792 01 Bruntál</p><p>Pro rezervaci si vyberte konkrétní termín v rozvrhu. Telefon, e-mail, mapa a sociální odkazy doplníme po konečném ověření zadavatelkou.</p><Link className="button" href="/rozvrh">Přejít na rozvrh</Link></ContentPage>; }

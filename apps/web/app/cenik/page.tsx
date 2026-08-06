import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "../../components/content-page";

export const metadata: Metadata = { title: "Ceník", description: "Aktuální cena je vždy uvedená u konkrétního termínu v rozvrhu Studio Balance." };
export default function PricesPage() { return <ContentPage eyebrow="Ceny a platba" title="Ceník"><p>Aktuální cena je vždy uvedená u konkrétního termínu v rozvrhu. Rezervace neobsahuje online platbu.</p><p>Platba probíhá až při návštěvě studia, hotově nebo kartou přes terminál.</p><Link className="button" href="/rozvrh">Zobrazit rozvrh a ceny</Link></ContentPage>; }

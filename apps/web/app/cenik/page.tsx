import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "../../components/content-page";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/cenik", title: "Ceník lekcí", description: "Ceny lekcí Studia Balance v Bruntále a informace o platbě. Přesnou cenu najdete vždy u konkrétního termínu v rozvrhu." });
export default function PricesPage() { return <ContentPage eyebrow="Ceny a platba" title="Ceník"><p>Aktuální cena je vždy uvedená u konkrétního termínu v rozvrhu. Rezervace neobsahuje online platbu.</p><p>Platba probíhá až při návštěvě studia, hotově nebo kartou přes terminál.</p><Link className="button" href="/rozvrh">Zobrazit rozvrh a ceny</Link></ContentPage>; }

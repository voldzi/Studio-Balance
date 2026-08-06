import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "../../components/content-page";

export const metadata: Metadata = { title: "O studiu", description: "Studio Balance je boutique prostor pro pohyb, sílu, klid a rovnováhu." };

export default function AboutPage() { return <ContentPage eyebrow="Studio Balance" image="/images/studio-balance/studio-gallery.jpeg" imageAlt="Dodaná vizualizace prostoru Studio Balance." title="Místo pro pohyb v rovnováze"><p>Studio Balance spojuje pohyb, sílu, stabilitu a klid v komorní atmosféře s osobním přístupem.</p><p>Vyberte si lekci podle svého aktuálního tempa a potřeb. V detailu každé lekce najdete náročnost, vhodnost, pomůcky i nejbližší termíny.</p><Link className="button" href="/lekce">Poznat lekce</Link></ContentPage>; }

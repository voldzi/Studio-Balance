import type { Metadata } from "next";
import Link from "next/link";

import { TeamSection } from "../../components/team-section";
import { ContentPage } from "../../components/content-page";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/o-studiu", title: "Pohybové studio v Bruntále", description: "Poznejte Studio Balance v Bruntále – komorní prostor pro pohyb, sílu, stabilitu a klid s osobním přístupem." });

export default function AboutPage() { return <ContentPage afterContent={<TeamSection />} eyebrow="Studio Balance" image="/images/studio-balance/studio-gallery.jpeg" imageAlt="Dodaná vizualizace prostoru Studio Balance." title="Místo pro pohyb v rovnováze"><p>Studio Balance spojuje pohyb, sílu, stabilitu a klid v komorní atmosféře s osobním přístupem.</p><p>Vyberte si lekci podle svého aktuálního tempa a potřeb. V detailu každé lekce najdete náročnost, vhodnost, pomůcky i nejbližší termíny.</p><Link className="button" href="/lekce">Poznat lekce</Link></ContentPage>; }

import type { Metadata } from "next";
import Image from "next/image";

import { ContentPage } from "../../components/content-page";

const images = [
  ["/images/studio-balance/studio-gallery.jpeg", "Dodaná vizualizace prostoru Studio Balance."],
  ["/images/studio-balance/lessons/barre.jpeg", "Ukázkový vizuál lekce Barre."],
  ["/images/studio-balance/lessons/trx.jpeg", "Ukázkový vizuál lekce TRX."],
  ["/images/studio-balance/lessons/balance-flow.jpeg", "Ukázkový vizuál Balance Flow."],
  ["/images/studio-balance/lessons/jumping.jpeg", "Ukázkový vizuál lekce Jumping."],
  ["/images/studio-balance/lessons/power-joga.jpeg", "Ukázkový vizuál lekce Power jóga."],
  ["/images/studio-balance/lessons/kruhovy-trenink.jpeg", "Ukázkový vizuál kruhového tréninku."]
] as const;
export const metadata: Metadata = { title: "Galerie", description: "Vizuální inspirace a ukázky lekcí Studio Balance." };
export default function GalleryPage() { return <ContentPage eyebrow="Atmosféra Studia Balance" title="Galerie"><p>Aktuální schválené vizuály lekcí. Po dokončení studia je nahradíme finálními fotografiemi prostoru a skutečně probíhajících lekcí.</p><div className="gallery-grid">{images.map(([src, alt]) => <figure key={src}><Image alt={alt} fill sizes="(max-width: 620px) 100vw, (max-width: 960px) 50vw, 33vw" src={src} /></figure>)}</div></ContentPage>; }

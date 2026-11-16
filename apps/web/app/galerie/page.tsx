import { readStudioWebsitePhotos } from "../../lib/read-studio-website-photos";
import type { Metadata } from "next";
import Image from "next/image";

import { ContentPage } from "../../components/content-page";
import { pageMetadata } from "../../lib/seo";

const images = [
  ["/images/studio-balance/studio-gallery.jpeg", "Dodaná vizualizace prostoru Studio Balance."],
  ["/images/studio-balance/lessons/barre.jpeg", "Ukázkový vizuál lekce Barre."],
  ["/images/studio-balance/lessons/trx.jpeg", "Ukázkový vizuál lekce TRX."],
  ["/images/studio-balance/lessons/balance-flow.jpeg", "Ukázkový vizuál Balance Flow."],
  ["/images/studio-balance/lessons/jumping.jpeg", "Ukázkový vizuál lekce Jumping."],
  ["/images/studio-balance/lessons/power-joga.jpeg", "Ukázkový vizuál lekce Power jóga."],
  ["/images/studio-balance/lessons/kruhovy-trenink.jpeg", "Ukázkový vizuál kruhového tréninku."]
] as const;
export const metadata: Metadata = pageMetadata({ path: "/galerie", title: "Galerie studia a lekcí", description: "Prohlédněte si Studio Balance v Bruntále a ukázky lekcí Barre, TRX, Balance Flow, Jumping, Latino Ladies a kruhového tréninku." });
export default async function GalleryPage() {
  const photos = await readStudioWebsitePhotos();
  const gallery = photos?.configured ? photos.gallery : images.map(([src, alt]) => ({ src, alt }));
  return <ContentPage eyebrow="Atmosféra Studia Balance" title="Galerie">
    <p>{photos?.configured ? "Prohlédněte si fotografie ze Studia Balance." : "Prostor studia a ukázkové vizuály lekcí."}</p>
    {gallery.length ? <div className="gallery-grid">{gallery.map(({src, alt}) => <figure key={src}>
      <Image alt={alt} fill sizes="(max-width: 620px) 100vw, (max-width: 960px) 50vw, 33vw" src={src} unoptimized={src.startsWith("/api/")} />
    </figure>)}</div> : <p>V galerii teď nejsou žádné fotografie.</p>}
  </ContentPage>;
}

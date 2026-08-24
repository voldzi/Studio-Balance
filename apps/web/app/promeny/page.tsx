import type { Metadata } from "next";

import { ContentPage } from "../../components/content-page";
import { TransformationsShowcase } from "../../components/transformations-showcase";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/promeny", title: "Proměny klientek", description: "Skutečné proměny klientek Studia Balance zveřejněné s jejich souhlasem. Výsledky jsou individuální." });

export default function TransformationsPage() {
  return <ContentPage eyebrow="Skutečné příběhy" title="Proměny klientek"><p>Každá zveřejněná dvojice fotografií a zkušenost klientky má doložený souhlas. Výsledky jsou individuální a neslibují stejný výsledek každému.</p><TransformationsShowcase /></ContentPage>;
}

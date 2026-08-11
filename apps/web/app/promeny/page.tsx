import type { Metadata } from "next";

import { ContentPage } from "../../components/content-page";
import { TransformationsShowcase } from "../../components/transformations-showcase";

export const metadata: Metadata = { title: "Proměny klientek | Studio Balance", description: "Skutečné proměny klientek Studia Balance zveřejněné s jejich souhlasem." };

export default function TransformationsPage() {
  return <ContentPage eyebrow="Skutečné příběhy" title="Proměny klientek"><p>Každá zveřejněná dvojice fotografií a zkušenost klientky má doložený souhlas. Výsledky jsou individuální a neslibují stejný výsledek každému.</p><TransformationsShowcase /></ContentPage>;
}

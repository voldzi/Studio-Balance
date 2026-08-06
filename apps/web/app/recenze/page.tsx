import type { Metadata } from "next";

import { ContentPage } from "../../components/content-page";

export const metadata: Metadata = { title: "Recenze", description: "Zkušenosti klientek Studio Balance." };
export default function ReviewsPage() { return <ContentPage eyebrow="Zkušenosti klientek" title="Recenze"><p>Ověřené recenze sem doplníme po jejich schválení zadavatelkou. Nezobrazujeme vymyšlená ani nepodložená hodnocení.</p></ContentPage>; }

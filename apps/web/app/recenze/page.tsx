import type { Metadata } from "next";

import { ReviewsShowcase } from "../../components/reviews-showcase";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = { title: "Recenze", description: "Ověřené zkušenosti klientek Studia Balance." };
export default function ReviewsPage() { return <><SiteHeader /><main className="content-shell"><header className="page-heading"><p className="eyebrow">Recenze</p><h1>Zkušenosti klientek</h1><p>Zveřejňujeme pouze skutečné reference, které klientky schválily k publikaci.</p></header><ReviewsShowcase /></main><SiteFooter /></>; }

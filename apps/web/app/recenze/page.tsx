import type { Metadata } from "next";

import { ReviewsShowcase } from "../../components/reviews-showcase";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/recenze", title: "Recenze klientek", description: "Přečtěte si schválené zkušenosti klientek s lekcemi TRX a Jumping ve Studiu Balance v Bruntále." });
export default function ReviewsPage() { return <><SiteHeader /><main className="content-shell"><header className="page-heading"><p className="eyebrow">Recenze</p><h1>Zkušenosti klientek</h1><p>Zveřejňujeme pouze skutečné reference, které klientky schválily k publikaci.</p></header><ReviewsShowcase /></main><SiteFooter /></>; }

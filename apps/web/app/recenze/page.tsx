import type { Metadata } from "next";

import { ReviewsShowcase } from "../../components/reviews-showcase";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/recenze", title: "Recenze klientek", description: "Přečtěte si zkušenosti klientek se Studiem Balance v Bruntále nebo napište svou vlastní recenzi." });
export default function ReviewsPage() { return <><SiteHeader /><main className="content-shell"><header className="page-heading"><p className="eyebrow">Recenze</p><h1>Zkušenosti klientek</h1><p>Recenze zveřejňujeme se souhlasem jejich autorů po kontrole obsahu. U recenzí zaslaných přes formulář neověřujeme návštěvu studia.</p></header><ReviewsShowcase /></main><SiteFooter /></>; }

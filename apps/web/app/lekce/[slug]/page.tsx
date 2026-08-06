import type { Metadata } from "next";

import { LessonDetail } from "../../../components/lesson-detail";
import { SiteHeader } from "../../../components/site-header";

export const metadata: Metadata = { title: "Detail lekce", description: "Obsah, náročnost a termíny lekce Studio Balance." };

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <><SiteHeader /><main className="detail-shell"><a className="back-link" href="/lekce">← Všechny lekce</a><LessonDetail slug={slug} /></main></>;
}

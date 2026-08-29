import type { Metadata } from "next";

import { LessonCatalog } from "../../components/lesson-catalog";
import { SiteHeader } from "../../components/site-header";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/lekce", title: "Lekce v Bruntále", description: "TRX, Barre, Jumping, Balance Flow, kruhový trénink a Power Yoga ve Studiu Balance v Bruntále. Vyberte si lekci podle náročnosti a zaměření." });

export default function LessonsPage() {
  return <><SiteHeader /><main className="content-shell"><header className="page-heading"><p className="eyebrow">Pohyb po svém</p><h1>Vyberte si svou lekci</h1><p>Každá lekce má vlastní tempo, zaměření a náročnost. Podrobnosti i nejbližší termíny najdete v jejím detailu.</p></header><LessonCatalog /></main></>;
}

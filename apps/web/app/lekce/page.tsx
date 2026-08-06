import type { Metadata } from "next";

import { LessonCatalog } from "../../components/lesson-catalog";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = { title: "Lekce", description: "Přehled lekcí Studia Balance včetně náročnosti, vhodnosti a nejbližších termínů." };

export default function LessonsPage() {
  return <><SiteHeader /><main className="content-shell"><header className="page-heading"><p className="eyebrow">Pohyb po svém</p><h1>Vyberte si svou lekci</h1><p>Každá lekce má vlastní tempo, zaměření a náročnost. Podrobnosti i nejbližší termíny najdete v jejím detailu.</p></header><LessonCatalog /></main></>;
}

import type { Metadata } from "next";

import { LessonDetail } from "../../../components/lesson-detail";
import { SiteHeader } from "../../../components/site-header";
import type { ClassTypeDetail } from "../../../lib/api-types";
import { pageMetadata } from "../../../lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const lesson = await loadLesson(slug);
  const title = lesson?.seoTitle?.replace(/\s*\|\s*Studio Balance\s*$/i, "") || lesson?.name || "Detail lekce";
  const description = lesson?.seoDescription || "Obsah, náročnost a nejbližší termíny lekce ve Studiu Balance v Bruntále.";
  return pageMetadata({
    description,
    ...(lesson?.heroImage?.src ? { imagePath: lesson.heroImage.src } : {}),
    path: `/lekce/${slug}`,
    title
  });
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <><SiteHeader /><main className="detail-shell"><a className="back-link" href="/lekce">← Všechny lekce</a><LessonDetail slug={slug} /></main></>;
}

async function loadLesson(slug: string): Promise<ClassTypeDetail | undefined> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return undefined;
  const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const response = await fetch(`${apiUrl}/api/v1/class-types/${encodeURIComponent(slug)}`, { next: { revalidate: 3600 } });
    return response.ok ? await response.json() as ClassTypeDetail : undefined;
  } catch {
    return undefined;
  }
}

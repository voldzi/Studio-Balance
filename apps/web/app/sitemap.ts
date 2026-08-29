import type { MetadataRoute } from "next";

import type { ClassType } from "../lib/api-types";
import { absolutePublicUrl } from "../lib/seo";

export const dynamic = "force-dynamic";

const publicPaths = [
  "",
  "/o-studiu",
  "/lekce",
  "/rozvrh",
  "/balance-flow",
  "/promeny",
  "/galerie",
  "/recenze",
  "/cenik",
  "/kontakt"
] as const;

async function lessonPaths(): Promise<string[]> {
  const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const response = await fetch(`${apiUrl}/api/v1/class-types`, { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const body = await response.json() as { items?: ClassType[] };
    return (body.items ?? []).filter((lesson) => lesson.active !== false).map((lesson) => `/lekce/${lesson.slug}`);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = [...publicPaths, ...await lessonPaths()];
  return paths.map((path, index) => ({
    changeFrequency: index === 0 || path === "/rozvrh" ? "weekly" : "monthly",
    priority: index === 0 ? 1 : path === "/rozvrh" || path === "/lekce" ? 0.9 : 0.7,
    url: absolutePublicUrl(path || "/")
  }));
}

import type { MetadataRoute } from "next";

const publicAppUrl = () => process.env.PUBLIC_APP_URL ?? (
  process.env.APP_ENV === "production" ? "https://studio-balance.cz" : "http://localhost:3000"
);

const publicPaths = [
  "",
  "/o-studiu",
  "/lekce",
  "/rozvrh",
  "/promeny",
  "/galerie",
  "/cenik",
  "/kontakt"
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicAppUrl();
  return publicPaths.map((path, index) => ({
    changeFrequency: index === 0 || path === "/rozvrh" ? "weekly" : "monthly",
    priority: index === 0 ? 1 : path === "/rozvrh" || path === "/lekce" ? 0.9 : 0.7,
    url: new URL(path || "/", origin).toString()
  }));
}

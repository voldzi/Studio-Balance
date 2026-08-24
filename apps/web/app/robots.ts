import type { MetadataRoute } from "next";

const publicAppUrl = () => process.env.PUBLIC_APP_URL ?? (
  process.env.APP_ENV === "production" ? "https://studio-balance.cz" : "http://localhost:3000"
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      disallow: ["/admin/", "/api/", "/auth/", "/muj-ucet"],
      userAgent: "*"
    },
    sitemap: new URL("/sitemap.xml", publicAppUrl()).toString()
  };
}

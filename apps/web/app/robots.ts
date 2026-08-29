import type { MetadataRoute } from "next";

import { absolutePublicUrl } from "../lib/seo";

const privatePaths = ["/admin/", "/api/", "/auth/", "/muj-ucet", "/prihlaseni", "/rezervace/"];
const searchAndAssistantAgents = [
  "Googlebot",
  "Bingbot",
  "SeznamBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User"
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...searchAndAssistantAgents.map((userAgent) => ({ allow: "/", disallow: privatePaths, userAgent })),
      { allow: "/", disallow: privatePaths, userAgent: "*" }
    ],
    sitemap: absolutePublicUrl("/sitemap.xml")
  };
}

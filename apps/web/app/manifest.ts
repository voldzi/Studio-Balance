import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Studio Balance",
    short_name: "Balance",
    description: "Studio Balance – pohyb, síla, klid a rovnováha v Bruntále.",
    start_url: "/muj-ucet",
    scope: "/",
    display: "standalone",
    background_color: "#F7F3EE",
    theme_color: "#B56E4F",
    lang: "cs",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" }
    ]
  };
}

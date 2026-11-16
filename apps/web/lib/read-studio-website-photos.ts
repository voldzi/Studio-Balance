import { cache } from "react";
import type { WebsitePhotos } from "./studio-website-photos";

export const readStudioWebsitePhotos = cache(async (): Promise<WebsitePhotos | null> => {
  try {
    const apiBase = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/u, "");
    const response = await fetch(`${apiBase}/api/v1/content/studio-photos`, {
      cache: "no-store", signal: AbortSignal.timeout(1200)
    });
    if (response.ok) return await response.json() as WebsitePhotos;
  } catch { /* Retain the bundled images when the API is unavailable. */ }
  return null;
});

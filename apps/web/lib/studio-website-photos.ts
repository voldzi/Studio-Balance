import type { components } from "../../../packages/contracts/src/generated";
export type WebsitePhotos = components["schemas"]["StudioPhotosPublic"];
export type AdminWebsitePhotos = components["schemas"]["StudioPhotosAdmin"];
export type WebsitePhotoEntry = components["schemas"]["StudioPhotoEntry"];
export type WebsitePhotoInput = components["schemas"]["StudioPhotosInput"];

export const websitePhotoLimit = 40;
export const websitePhotoMime = ["image/jpeg", "image/png", "image/webp"];
export const websitePhotoBytes = 8 * 1024 * 1024;

export function moveWebsitePhoto<T extends { assetId: string }>(entries: T[], sourceId: string, targetId: string): T[] {
  const source = entries.findIndex((entry) => entry.assetId === sourceId);
  const target = entries.findIndex((entry) => entry.assetId === targetId);
  if (source < 0 || target < 0 || source === target) return entries;
  const next = [...entries];
  next.splice(target, 0, next.splice(source, 1)[0]!);
  return next;
}

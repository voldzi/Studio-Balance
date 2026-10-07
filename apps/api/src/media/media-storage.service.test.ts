import { describe, expect, it } from "vitest";
import sharp from "sharp";

import type { RuntimeConfigService } from "../config/runtime-config.js";
import { MediaStorageService } from "./media-storage.service.js";

const service = () => new MediaStorageService({ value: {} } as RuntimeConfigService);

describe("raster upload boundary", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodes a real %s and strips image metadata", async (format) => {
    const input = await sharp({ create: { width: 24, height: 16, channels: 3, background: "#b56e4f" } })
      .withMetadata({ exif: { IFD0: { Artist: "Private test metadata" } } }).toFormat(format).toBuffer();
    const result = await service().prepareImage(input);
    const metadata = await sharp(result.body).metadata();
    expect(result).toMatchObject({ contentType: "image/webp", width: 24, height: 16 });
    expect(metadata.exif).toBeUndefined();
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>',
    '\ufeff  <svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    "%PDF-1.7 fake document",
    "not an image"
  ])("rejects unsupported content before image decoding", async (value) => {
    await expect(service().prepareImage(Buffer.from(value))).rejects.toMatchObject({ status: 400 });
  });

  it("rejects empty, oversized and corrupted raster content", async () => {
    for (const input of [Buffer.alloc(0), Buffer.alloc(8 * 1024 * 1024 + 1), Buffer.from([0xff, 0xd8, 0xff, 0x00])]) {
      await expect(service().prepareImage(input)).rejects.toMatchObject({ status: 400 });
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import type { MediaStorageService } from "./media-storage.service.js";
import { MediaController } from "./media.controller.js";
import type { FastifyReply } from "fastify";
const id = "10000000-0000-4000-8000-000000000001";
describe("public lesson media", () => {
  it("requires an explicit published association before reading storage", async () => {
    const query = vi.fn().mockResolvedValue({rows:[]}); const get = vi.fn();
    const controller = new MediaController({query} as unknown as DatabaseService, {get} as unknown as MediaStorageService);
    await expect(controller.get(id, {} as FastifyReply)).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(query.mock.calls[0]?.[0]).toContain("c.active=true AND c.hero_image_path='/api/v1/media/' || ma.id::text");
    expect(query.mock.calls[0]?.[1]).toEqual([id]);
  });
  it("serves a referenced asset without exposing storage keys", async () => {
    const query = vi.fn().mockResolvedValue({rows:[{storage_key:"studio/image.webp"}]});
    const get = vi.fn().mockResolvedValue(new Uint8Array([1,2])); const send = vi.fn(); const type = vi.fn().mockReturnValue({send});
    const controller = new MediaController({query} as unknown as DatabaseService, {get} as unknown as MediaStorageService);
    await controller.get(id, {type} as unknown as FastifyReply);
    expect(get).toHaveBeenCalledWith("studio/image.webp"); expect(type).toHaveBeenCalledWith("image/webp"); expect(send).toHaveBeenCalledWith(Buffer.from([1,2]));
  });
});

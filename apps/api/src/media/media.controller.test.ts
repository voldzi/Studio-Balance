import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DatabaseService } from "../database/database.service.js";
import { MediaStorageService } from "./media-storage.service.js";
import { MediaController } from "./media.controller.js";
import type { FastifyReply } from "fastify";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
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
    const get = vi.fn().mockResolvedValue(new Uint8Array([1,2])); const send = vi.fn(); const type = vi.fn().mockReturnValue({send}); const header = vi.fn().mockReturnValue({type});
    const controller = new MediaController({query} as unknown as DatabaseService, {get} as unknown as MediaStorageService);
    await controller.get(id, {header} as unknown as FastifyReply);
    expect(header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(get).toHaveBeenCalledWith("studio/image.webp"); expect(type).toHaveBeenCalledWith("image/webp"); expect(send).toHaveBeenCalledWith(Buffer.from([1,2]));
  });
});

describe("public media HTTP publication boundary", () => {
  let app: NestFastifyApplication;
  afterEach(async () => { await app?.close(); });

  it("serves an active association without caching, then hides it immediately after unpublishing", async () => {
    let published = true;
    const query = vi.fn(async () => ({ rows: published ? [{ storage_key: "private-storage-key.webp" }] : [] }));
    const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const get = vi.fn().mockResolvedValue(bytes);
    const module = await Test.createTestingModule({ controllers: [MediaController], providers: [
      { provide: DatabaseService, useValue: { query } },
      { provide: MediaStorageService, useValue: { get } }
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(app, loadRuntimeConfig({ APP_ENV: "test", APP_VERSION: "media-http-test", LOG_LEVEL: "error" }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const visible = await app.inject({ method: "GET", url: `/api/v1/media/${id}` });
    expect(visible.statusCode).toBe(200);
    expect(visible.headers["cache-control"]).toBe("private, no-store");
    expect(visible.headers["content-type"]).toBe("image/webp");
    expect(visible.rawPayload).toEqual(bytes);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("private-storage-key.webp");

    published = false;
    const hidden = await app.inject({ method: "GET", url: `/api/v1/media/${id}` });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.headers["cache-control"]).toBe("private, no-store");
    expect(hidden.json()).toMatchObject({ error: { code: "RESOURCE_NOT_FOUND", requestId: expect.any(String) } });
    expect(hidden.body).not.toContain("private-storage-key.webp");
    expect(query).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

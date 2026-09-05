import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminTeamController, TeamController } from "./team.controller.js";
import { AdminRoleGuard } from "../admin/admin-role.guard.js";
import { OpaqueSessionService } from "../auth/opaque-session.service.js";
import { opaqueSessionServiceTestDouble } from "../auth/session.test-support.js";
import { RuntimeConfigService, loadRuntimeConfig } from "../config/runtime-config.js";
import { DatabaseService } from "../database/database.service.js";
import { configureHttp } from "../http/configure-http.js";
import { AdminMediaController, MediaController } from "../media/media.controller.js";
import { MediaStorageService } from "../media/media-storage.service.js";

const secret = "local-test-secret-that-is-at-least-32-characters";
const config = loadRuntimeConfig({ APP_ENV: "test", APP_VERSION: "test", SESSION_SECRET: secret, LOG_LEVEL: "error" });
const photo = { src: "/api/v1/media/11111111-1111-4111-8111-111111111111", alt: "Náš tým", width: 1024, height: 1535 };
const row = { title: "Náš tým", body: "Poznejte lidi ze Studia Balance.", photo, photoAlt: "Náš tým", photoAssetId: "11111111-1111-4111-8111-111111111111", published: true };

describe("studio team API contract and media authorization", () => {
  let app: NestFastifyApplication;
  afterEach(async () => { await app?.close(); });
  async function setup(rows: unknown[] = [row]) {
    const query = vi.fn(async () => ({ rows, rowCount: rows.length }));
    const storage = { prepareImage: vi.fn(async () => ({ body: Buffer.from("webp"), contentType: "image/webp", width: 100, height: 150 })), put: vi.fn(async () => undefined), get: vi.fn(async () => Buffer.from("webp")) };
    const module = await Test.createTestingModule({ controllers: [TeamController,AdminTeamController,AdminMediaController,MediaController], providers: [AdminRoleGuard,
      { provide: RuntimeConfigService, useValue: { value: config } }, { provide: OpaqueSessionService, useValue: opaqueSessionServiceTestDouble },
      { provide: DatabaseService, useValue: { query, transaction: async (work: (db: { query: typeof query }) => Promise<unknown>) => work({ query }) } },
      { provide: MediaStorageService, useValue: storage }
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(app, config); await app.init(); await app.getHttpAdapter().getInstance().ready();
    return { query, storage };
  }
  async function cookie(roles: string[]) {
    const token = await new SignJWT({ email: "operator@example.test", email_verified: true, roles, amr: ["pwd","otp"] }).setProtectedHeader({ alg: "HS256" }).setSubject("admin")
      .setIssuer("studio-balance-web").setAudience("studio-balance-api").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    return `sb_admin_session=${token}`;
  }
  it("returns only public content, including the image dimensions declared by OpenAPI", async () => {
    await setup(); const result = await app.inject({ method: "GET", url: "/api/v1/content/team" });
    expect(result.statusCode).toBe(200); expect(result.json()).toEqual({ team: { title: row.title,body: row.body,photo } });
    const spec = JSON.parse(await readFile(new URL("../../../../openapi/openapi.json", import.meta.url),"utf8"));
    expect(Object.keys(result.json().team).sort()).toEqual(spec.components.schemas.TeamContent.required.sort());
    expect(Object.keys(photo).sort()).toEqual(spec.components.schemas.StudioImage.required.sort());
    expect(spec.paths["/api/v1/admin/media/studio-image"].post.security).toEqual([{ adminSession: [] }]);
  });
  it("returns a true empty state when no team section is published", async () => {
    await setup([]); expect((await app.inject({ method: "GET",url: "/api/v1/content/team" })).json()).toEqual({ team: null });
  });
  it("rejects anonymous edits and a client role without writing", async () => {
    const { query } = await setup();
    for (const [headers,status] of [[{},401],[{ cookie: await cookie(["client"]) },403]] as const) {
      const response = await app.inject({ method: "PUT", url: "/api/v1/admin/content/team", headers, payload: {} });
      expect(response.statusCode).toBe(status); expect(response.json().error.requestId).toBeTruthy();
    }
    expect(query).not.toHaveBeenCalled();
  });
  it("validates admin input and preserves the existing photo when the field is omitted", async () => {
    const { query } = await setup(); const headers = { cookie: await cookie(["admin"]) };
    expect((await app.inject({ method: "PUT",url: "/api/v1/admin/content/team",headers,payload: { title: "x" } })).statusCode).toBe(400);
    const result = await app.inject({ method: "PUT",url: "/api/v1/admin/content/team",headers,payload: { title: row.title,body: row.body,photoAlt: row.photoAlt,published: true } });
    expect(result.statusCode).toBe(200); expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE studio_team"), [row.title,row.body,row.photoAlt,true,false,null]);
    expect(result.json().photo.src).toContain("/api/v1/admin/media/");
  });
  it("does not expose an unreferenced upload by its public URL", async () => {
    const { storage } = await setup([]);
    const result = await app.inject({ method: "GET",url: photo.src });
    expect(result.statusCode).toBe(404); expect(storage.get).not.toHaveBeenCalled();
  });
  it("protects the new upload route before decoding any image", async () => {
    const { storage } = await setup();
    const result = await app.inject({ method: "POST",url: "/api/v1/admin/media/studio-image",payload: {} });
    expect(result.statusCode).toBe(401); expect(storage.prepareImage).not.toHaveBeenCalled();
  });
});

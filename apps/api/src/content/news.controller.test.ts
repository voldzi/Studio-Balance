import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminRoleGuard } from "../admin/admin-role.guard.js";
import { OpaqueSessionService } from "../auth/opaque-session.service.js";
import { opaqueSessionServiceTestDouble } from "../auth/session.test-support.js";
import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
import { AdminNewsController, NewsController } from "./news.controller.js";
import { NewsService } from "./news.service.js";

const config: RuntimeConfig = {
  apiPort: 3001,
  databaseUrl: "postgresql://unused",
  environment: "test",
  logLevel: "error",
  oidc: { issuer: "http://localhost:8081/realms/studio-balance", webClientId: "web", webClientSecret: "web-secret", adminClientId: "admin", adminClientSecret: "admin-secret" },
  sessionSecret: "test-session-secret-that-is-long-enough-to-be-safe",
  version: "test"
};

describe("news API", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => { await app?.close(); });

  async function setup() {
    const service = {
      create: vi.fn(async () => ({ id: "e3124cd6-c83c-455b-a8b5-c499a9b0a97f" })),
      listAdmin: vi.fn(async () => ({ items: [] })),
      listPublic: vi.fn(async () => ({ items: [{ id: "e3124cd6-c83c-455b-a8b5-c499a9b0a97f", title: "Novinka", summary: "Krátké pravdivé shrnutí.", body: "Úplný pravdivý text novinky.", publishedAt: "2026-08-13T10:00:00.000Z" }] })),
      update: vi.fn(async () => ({ id: "e3124cd6-c83c-455b-a8b5-c499a9b0a97f" }))
    };
    const module = await Test.createTestingModule({
      controllers: [NewsController, AdminNewsController],
      providers: [
        AdminRoleGuard,
        { provide: OpaqueSessionService, useValue: opaqueSessionServiceTestDouble },
        { provide: RuntimeConfigService, useValue: { value: config } },
        { provide: NewsService, useValue: service }
      ]
    }).compile();
    const created = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(created, config);
    await created.init(); await created.getHttpAdapter().getInstance().ready(); app = created;
    return { app: created, service };
  }

  async function adminCookie() {
    const token = await new SignJWT({ email: "admin@example.test", email_verified: true, roles: ["admin"] })
      .setProtectedHeader({ alg: "HS256" }).setSubject("admin").setIssuer("studio-balance-web")
      .setAudience("studio-balance-api").setIssuedAt().setExpirationTime("1h")
      .sign(new TextEncoder().encode(config.sessionSecret));
    return `sb_admin_session=${token}`;
  }

  const payload = {
    body: "Úplný pravdivý text novinky pro klientky.",
    featured: false,
    published: true,
    publishedAt: "2026-08-13T10:00:00.000Z",
    sortOrder: 10,
    summary: "Krátké pravdivé shrnutí novinky.",
    title: "Nová lekce"
  };

  it("returns only the public news supplied by the service", async () => {
    const { app: current } = await setup();

    const response = await current.inject({ method: "GET", url: "/api/v1/news" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("public");
    expect(response.json().items[0]).toMatchObject({ title: "Novinka" });
  });

  it("protects drafts and prevents their caching", async () => {
    const { app: current } = await setup();
    expect((await current.inject({ method: "GET", url: "/api/v1/admin/content/news" })).statusCode).toBe(401);
    const response = await current.inject({ method: "GET", url: "/api/v1/admin/content/news", headers: { cookie: await adminCookie() } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("validates publication rules before writing", async () => {
    const { app: current, service } = await setup();
    const response = await current.inject({ method: "POST", url: "/api/v1/admin/content/news", headers: { cookie: await adminCookie() }, payload: { ...payload, published: false, featured: true } });
    expect(response.statusCode).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("accepts a valid published news item", async () => {
    const { app: current, service } = await setup();
    const response = await current.inject({ method: "POST", url: "/api/v1/admin/content/news", headers: { cookie: await adminCookie() }, payload });
    expect(response.statusCode).toBe(201);
    expect(service.create).toHaveBeenCalledWith(payload, expect.any(Object));
  });
});

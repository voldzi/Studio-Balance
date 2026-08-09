import "reflect-metadata";

import { readFileSync } from "node:fs";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminRoleGuard } from "../admin/admin-role.guard.js";
import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
import { AdminReviewsController, ReviewsController } from "./reviews.controller.js";
import { InvalidReviewClassTypeError, ReviewsService } from "./reviews.service.js";

const config: RuntimeConfig = {
  apiPort: 3001,
  databaseUrl: "postgresql://unused",
  environment: "test",
  logLevel: "error",
  sessionSecret: "test-session-secret-that-is-long-enough-to-be-safe",
  version: "test"
};

describe("reviews API", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => { await app?.close(); });

  async function createApplication() {
    const reviews = {
      create: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
      listAdmin: vi.fn(async () => ({ items: [] })),
      listPublic: vi.fn(async () => ({ items: [{ id: "11111111-1111-4111-8111-111111111111", authorLabel: "Jana", body: "Ověřená zkušenost s lekcí.", source: "Osobní reference", reviewedOn: null, rating: null, classType: null }] })),
      update: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" }))
    };
    const module = await Test.createTestingModule({
      controllers: [ReviewsController, AdminReviewsController],
      providers: [
        AdminRoleGuard,
        { provide: RuntimeConfigService, useValue: { value: config } },
        { provide: ReviewsService, useValue: reviews }
      ]
    }).compile();
    const created = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(created, config);
    await created.init();
    await created.getHttpAdapter().getInstance().ready();
    app = created;
    return { app: created, reviews };
  }

  async function cookie(roles: string[]) {
    const token = await new SignJWT({ email: "operator@example.test", email_verified: true, roles })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin-subject")
      .setIssuer("studio-balance-web")
      .setAudience("studio-balance-api")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(config.sessionSecret));
    return `sb_admin_session=${token}`;
  }

  it("returns only approved featured reviews for the homepage request", async () => {
    const setup = await createApplication();
    const response = await setup.app.inject({ method: "GET", url: "/api/v1/reviews?featured=true" });
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({ authorLabel: "Jana", rating: null });
    expect(setup.reviews.listPublic).toHaveBeenCalledWith(true);
    expect(response.headers["cache-control"]).toContain("max-age=60");
  });

  it("rejects an invalid public filter", async () => {
    const setup = await createApplication();
    const response = await setup.app.inject({ method: "GET", url: "/api/v1/reviews?featured=yes" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("protects review administration with the separate admin role", async () => {
    const setup = await createApplication();
    const anonymous = await setup.app.inject({ method: "GET", url: "/api/v1/admin/content/reviews" });
    const client = await setup.app.inject({ method: "GET", url: "/api/v1/admin/content/reviews", headers: { cookie: await cookie(["client"]) } });
    const admin = await setup.app.inject({ method: "GET", url: "/api/v1/admin/content/reviews", headers: { cookie: await cookie(["admin"]) } });
    expect(anonymous.statusCode).toBe(401);
    expect(client.statusCode).toBe(403);
    expect(admin.statusCode).toBe(200);
    expect(admin.headers["cache-control"]).toBe("private, no-store");
  });

  it("normalizes an omitted optional source to null", async () => {
    const setup = await createApplication();
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/v1/admin/content/reviews",
      headers: { cookie: await cookie(["admin"]) },
      payload: {
        authorLabel: "Jana",
        body: "Skutečná zkušenost s lekcí.",
        classTypeId: null,
        consentConfirmed: false,
        featured: false,
        published: false,
        rating: null,
        reviewedOn: null,
        sortOrder: 10
      }
    });
    expect(response.statusCode).toBe(201);
    expect(setup.reviews.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: null }),
      expect.any(Object)
    );
  });

  it("returns validation error for a missing or inactive class type", async () => {
    const setup = await createApplication();
    setup.reviews.create.mockRejectedValueOnce(new InvalidReviewClassTypeError());
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/v1/admin/content/reviews",
      headers: { cookie: await cookie(["admin"]) },
      payload: {
        authorLabel: "Jana",
        body: "Skutečná zkušenost s lekcí.",
        classTypeId: "22222222-2222-4222-8222-222222222222",
        consentConfirmed: true,
        featured: true,
        published: true,
        rating: 5,
        reviewedOn: null,
        sortOrder: 10,
        source: null
      }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("requires confirmed consent before publishing", async () => {
    const setup = await createApplication();
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/v1/admin/content/reviews",
      headers: { cookie: await cookie(["admin"]) },
      payload: {
        authorLabel: "Jana",
        body: "Skutečná zkušenost s lekcí.",
        classTypeId: null,
        consentConfirmed: false,
        featured: true,
        published: true,
        rating: null,
        reviewedOn: null,
        sortOrder: 10,
        source: "Předané zadavatelkou"
      }
    });
    expect(response.statusCode).toBe(400);
    expect(setup.reviews.create).not.toHaveBeenCalled();
  });

  it("keeps AdminReview as a closed flat response schema", () => {
    const document = JSON.parse(readFileSync(
      new URL("../../../../openapi/openapi.json", import.meta.url),
      "utf8"
    )) as {
      components: { schemas: Record<string, {
        additionalProperties?: boolean;
        allOf?: unknown;
        properties?: Record<string, unknown>;
        required?: string[];
      }> };
    };
    const schema = document.components.schemas.AdminReview!;

    expect(schema.allOf).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining([
      "id", "authorLabel", "body", "source", "classTypeId", "consentConfirmed",
      "published", "featured", "sortOrder"
    ]));
    expect(schema.properties).toEqual(expect.objectContaining({
      id: expect.any(Object),
      classTypeId: expect.any(Object),
      published: expect.any(Object)
    }));
  });
});

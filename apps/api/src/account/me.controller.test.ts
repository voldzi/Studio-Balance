import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
import { AccountService } from "./account.service.js";
import { MeController } from "./me.controller.js";

const config: RuntimeConfig = {
  apiPort: 3001,
  databaseUrl: "postgresql://unused",
  environment: "test",
  logLevel: "error",
  sessionSecret: "test-session-secret-that-is-long-enough-to-be-safe",
  version: "test"
};

describe("GET /api/v1/me", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function createApplication(): Promise<NestFastifyApplication> {
    const module = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        SessionAuthGuard,
        { provide: RuntimeConfigService, useValue: { value: config } },
        {
          provide: AccountService,
          useValue: {
            ensureProfile: async () => ({
              id: "f491172b-5c71-4972-b7ff-3983b2ea65fe",
              oidc_subject: "4887f1a5-6023-4b9c-9291-7e84f2f5be69",
              email: "client@example.test",
              email_verified: true,
              first_name: null,
              last_name: null,
              phone: null,
              terms_version: null
            }),
            listNotifications: async () => ({
              items: [{
                id: "95dfe8fb-87db-4afb-8903-88edcf8b07c1",
                kind: "booking_confirmed",
                title: "Rezervace je potvrzená",
                body: "Barre · 8. 8. 2026 17:00",
                readAt: null,
                createdAt: "2026-08-06T10:00:00.000Z"
              }]
            }),
            listFavorites: async () => ({
              items: [{
                id: "20000000-0000-4000-8000-000000000002",
                name: "TRX",
                slug: "trx",
                tagline: "Funkční síla a kontrola",
                difficulty: 4,
                heroImage: { src: "/images/studio-balance/trx.jpeg", alt: "TRX" },
                favoritedAt: "2026-08-13T10:00:00.000Z"
              }]
            }),
            addFavorite: async (_session: unknown, id: string) => ({ id }),
            removeFavorite: async () => undefined
          }
        }
      ]
    }).compile();
    const created = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), {
      logger: false
    });
    configureHttp(created, config);
    await created.init();
    await created.getHttpAdapter().getInstance().ready();
    app = created;
    return created;
  }

  async function session(): Promise<string> {
    return new SignJWT({ email: "client@example.test", email_verified: true, roles: ["client"] })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("4887f1a5-6023-4b9c-9291-7e84f2f5be69")
      .setIssuer("studio-balance-web")
      .setAudience("studio-balance-api")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(config.sessionSecret));
  }

  it("returns only the authenticated identity from the HTTP-only session", async () => {
    const current = await createApplication();
    const response = await current.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: `sb_session=${await session()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      subject: "4887f1a5-6023-4b9c-9291-7e84f2f5be69",
      email: "client@example.test",
      emailVerified: true,
      roles: ["client"],
      firstName: null,
      lastName: null,
      phone: null,
      termsVersion: null,
      profileComplete: false
    });
  });

  it("uses the standard error contract without a session", async () => {
    const current = await createApplication();
    const response = await current.inject({ method: "GET", url: "/api/v1/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Pro pokračování se prosím přihlaste." }
    });
  });

  it("shows recent booking messages only to the authenticated account", async () => {
    const current = await createApplication();
    const response = await current.inject({
      method: "GET",
      url: "/api/v1/me/notifications",
      headers: { cookie: `sb_session=${await session()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [{
        id: "95dfe8fb-87db-4afb-8903-88edcf8b07c1",
        kind: "booking_confirmed",
        title: "Rezervace je potvrzená",
        body: "Barre · 8. 8. 2026 17:00",
        readAt: null,
        createdAt: "2026-08-06T10:00:00.000Z"
      }]
    });
  });

  it("keeps favorites private and supports idempotent add and remove", async () => {
    const current = await createApplication();
    const cookie = { cookie: `sb_session=${await session()}` };
    const list = await current.inject({ method: "GET", url: "/api/v1/me/favorites", headers: cookie });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0]).toMatchObject({ name: "TRX", slug: "trx" });

    const id = "20000000-0000-4000-8000-000000000002";
    const add = await current.inject({ method: "POST", url: `/api/v1/me/favorites/${id}`, headers: cookie });
    expect(add.statusCode).toBe(201);
    expect(add.json()).toEqual({ id });

    const remove = await current.inject({ method: "DELETE", url: `/api/v1/me/favorites/${id}`, headers: cookie });
    expect(remove.statusCode).toBe(200);
    expect(remove.json()).toEqual({ id });
  });

  it("rejects favorites without an authenticated session", async () => {
    const current = await createApplication();
    const response = await current.inject({ method: "GET", url: "/api/v1/me/favorites" });
    expect(response.statusCode).toBe(401);
  });
});

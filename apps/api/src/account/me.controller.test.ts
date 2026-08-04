import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
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
      providers: [SessionAuthGuard, { provide: RuntimeConfigService, useValue: { value: config } }]
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
      roles: ["client"]
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
});

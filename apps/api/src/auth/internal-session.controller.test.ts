import "reflect-metadata";

import { createHmac } from "node:crypto";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
import { InternalSessionController } from "./internal-session.controller.js";
import { InternalSessionGuard } from "./internal-session.guard.js";
import { OpaqueSessionService } from "./opaque-session.service.js";

const config: RuntimeConfig = {
  apiPort: 3001,
  databaseUrl: "postgresql://unused",
  environment: "test",
  logLevel: "error",
  oidc: { issuer: "http://localhost:8081/realms/studio-balance", webClientId: "web", webClientSecret: "web-secret", adminClientId: "admin", adminClientSecret: "admin-secret" },
  sessionSecret: "test-session-secret-that-is-long-enough-to-be-safe",
  version: "test"
};
const session = { subject: "subject", email: "client@example.test", emailVerified: false, roles: ["client"] };

describe("internal opaque session API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function createApplication() {
    const opaque = { create: vi.fn(async () => ({ token: "a".repeat(43) })), resolveToken: vi.fn(async () => session), revokeToken: vi.fn(async () => undefined) };
    const module = await Test.createTestingModule({
      controllers: [InternalSessionController],
      providers: [InternalSessionGuard, { provide: RuntimeConfigService, useValue: { value: config } }, { provide: OpaqueSessionService, useValue: opaque }]
    }).compile();
    const created = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(created, config);
    await created.init();
    await created.getHttpAdapter().getInstance().ready();
    app = created;
    return { app: created, opaque };
  }

  function headers(path: string) {
    const timestamp = String(Date.now());
    return {
      "x-studiobalance-internal-timestamp": timestamp,
      "x-studiobalance-internal-signature": createHmac("sha256", config.sessionSecret).update(`${timestamp}:POST:${path}`).digest("base64url")
    };
  }

  it("rejects a browser request without the server-to-server signature", async () => {
    const { app } = await createApplication();
    const response = await app.inject({ method: "POST", url: "/api/internal/sessions/resolve", payload: { kind: "web", token: "a".repeat(43) } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("creates and resolves a session only for a signed web-server request", async () => {
    const { app, opaque } = await createApplication();
    const create = await app.inject({ method: "POST", url: "/api/internal/sessions", headers: headers("/api/internal/sessions"), payload: { kind: "web", refreshToken: "r".repeat(24), session } });
    expect(create.statusCode).toBe(201);
    expect(create.headers["cache-control"]).toBe("no-store");
    expect(opaque.create).toHaveBeenCalledWith({ kind: "web", refreshToken: "r".repeat(24), session });

    const resolve = await app.inject({ method: "POST", url: "/api/internal/sessions/resolve", headers: headers("/api/internal/sessions/resolve"), payload: { kind: "web", token: "a".repeat(43) } });
    expect(resolve.statusCode).toBe(201);
    expect(resolve.json()).toEqual({ session });
  });
});

import "reflect-metadata";

import { createHash, createHmac, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Http2ServerRequest } from "node:http2";

import { Test } from "@nestjs/testing";
import type { ExecutionContext } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp, requestIdFromHeader } from "../http/configure-http.js";
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
const session = { subject: "subject", email: "client@example.test", emailVerified: false, mfaVerified: false, roles: ["client"] };

describe("internal opaque session API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  async function createApplication() {
    const opaque = { create: vi.fn(async () => ({ token: "a".repeat(43) })), resolveToken: vi.fn(async () => session), revokeToken: vi.fn(async () => undefined) };
    const module = await Test.createTestingModule({
      controllers: [InternalSessionController],
      providers: [InternalSessionGuard, { provide: RuntimeConfigService, useValue: { value: config } }, { provide: OpaqueSessionService, useValue: opaque }]
    }).compile();
    const created = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false,
      genReqId: (request: IncomingMessage | Http2ServerRequest) => requestIdFromHeader(request.headers["x-request-id"]) }), { logger: false, rawBody: true });
    configureHttp(created, config);
    await created.init();
    await created.getHttpAdapter().getInstance().ready();
    app = created;
    return { app: created, opaque };
  }

  function headers(path: string, payload: object | string, timestamp = String(Date.now())) {
    const nonce = randomBytes(16).toString("base64url");
    const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
    return {
      "content-type": "application/json",
      "x-studiobalance-internal-nonce": nonce,
      "x-studiobalance-internal-timestamp": timestamp,
      "x-studiobalance-internal-signature": createHmac("sha256", config.sessionSecret).update(`${timestamp}:${nonce}:POST:${path}:${createHash("sha256").update(rawBody).digest("hex")}`).digest("base64url")
    };
  }

  it("rejects a browser request without the server-to-server signature", async () => {
    const { app } = await createApplication();
    const response = await app.inject({ method: "POST", url: "/api/internal/sessions/resolve", payload: { kind: "web", token: "a".repeat(43) } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("fails closed if the HTTP adapter omits the exact raw request body", () => {
    const path = "/api/internal/sessions/resolve";
    const payload = { kind: "web", token: "a".repeat(43) };
    const guard = new InternalSessionGuard({ value: config } as RuntimeConfigService);
    const request = { method: "POST", url: path, routeOptions: { url: path }, headers: headers(path, payload), body: payload };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow("Interní požadavek nebyl ověřen.");
  });

  it("creates and resolves a session only for a signed web-server request", async () => {
    const { app, opaque } = await createApplication();
    const payload = { kind: "web", refreshToken: "r".repeat(24), session };
    const create = await app.inject({ method: "POST", url: "/api/internal/sessions", headers: headers("/api/internal/sessions", payload), payload });
    expect(create.statusCode).toBe(201);
    expect(create.headers["cache-control"]).toBe("no-store");
    expect(opaque.create).toHaveBeenCalledWith({ kind: "web", refreshToken: "r".repeat(24), session });

    const resolvePayload = { kind: "web", token: "a".repeat(43) };
    const resolve = await app.inject({ method: "POST", url: "/api/internal/sessions/resolve", headers: headers("/api/internal/sessions/resolve", resolvePayload), payload: resolvePayload });
    expect(resolve.statusCode).toBe(201);
    expect(resolve.json()).toEqual({ session });
  });

  it("correlates signed resolve and logout requests without changing the signed body", async () => {
    const { app, opaque } = await createApplication();
    const payload = { kind: "admin", token: "a".repeat(43) };
    for (const operation of ["resolve", "revoke"] as const) {
      const path = `/api/internal/sessions/${operation}`;
      const response = await app.inject({ method: "POST", url: path, payload,
        headers: { ...headers(path, payload), "x-request-id": "req_bff_correlation" } });
      expect(response.statusCode).toBe(201);
      expect(response.headers["x-request-id"]).toBe("req_bff_correlation");
      expect(operation === "resolve" ? opaque.resolveToken : opaque.revokeToken)
        .toHaveBeenCalledWith(payload.token, "admin", "req_bff_correlation");
    }
  });

  it("rejects substituted roles and MFA before creating an application session", async () => {
    const { app, opaque } = await createApplication();
    const payload = { kind: "web", refreshToken: "r".repeat(24), session };
    const response = await app.inject({ method: "POST", url: "/api/internal/sessions", headers: headers("/api/internal/sessions", payload),
      payload: { ...payload, kind: "admin", session: { ...session, roles: ["admin"], mfaVerified: true } } });
    expect(response.statusCode).toBe(401);
    expect(opaque.create).not.toHaveBeenCalled();
  });

  it("authenticates the exact bytes including JSON whitespace and rejects replay", async () => {
    const { app, opaque } = await createApplication();
    const payload = JSON.stringify({ kind: "web", token: "a".repeat(43) }, null, 2);
    const signedHeaders = headers("/api/internal/sessions/resolve", payload);
    const altered = await app.inject({ method: "POST", url: "/api/internal/sessions/resolve", headers: signedHeaders, payload: JSON.stringify(JSON.parse(payload)) });
    expect(altered.statusCode).toBe(401);
    const first = await app.inject({ method: "POST", url: "/api/internal/sessions/resolve", headers: signedHeaders, payload });
    expect(first.statusCode).toBe(201);
    const replay = await app.inject({ method: "POST", url: "/api/internal/sessions/resolve", headers: signedHeaders, payload });
    expect(replay.statusCode).toBe(401);
    expect(opaque.resolveToken).toHaveBeenCalledTimes(1);
  });

  it("rejects expired or legacy signatures without consuming provider credentials", async () => {
    const { app, opaque } = await createApplication();
    const payload = { kind: "web", token: "a".repeat(43) };
    for (const signedHeaders of [headers("/api/internal/sessions/resolve", payload, String(Date.now() - 60_001)),
      { "x-studiobalance-internal-timestamp": String(Date.now()), "x-studiobalance-internal-signature": "a".repeat(43) }]) {
      const response = await app.inject({ method: "POST", url: "/api/internal/sessions/resolve", headers: signedHeaders, payload });
      expect(response.statusCode).toBe(401);
    }
    expect(opaque.resolveToken).not.toHaveBeenCalled();
  });
});

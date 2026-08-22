import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { OpaqueSessionService } from "../auth/opaque-session.service.js";
import { opaqueSessionServiceTestDouble } from "../auth/session.test-support.js";
import { configureHttp } from "../http/configure-http.js";
import { AdminController } from "./admin.controller.js";
import { AdminRoleGuard } from "./admin-role.guard.js";
import { AdminService } from "./admin.service.js";

const config: RuntimeConfig = { apiPort: 3001, databaseUrl: "postgresql://unused", environment: "test", logLevel: "error", oidc: { issuer: "http://localhost:8081/realms/studio-balance", webClientId: "web", webClientSecret: "web-secret", adminClientId: "admin", adminClientSecret: "admin-secret" }, sessionSecret: "test-session-secret-that-is-long-enough-to-be-safe", version: "test" };

describe("admin authorization", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => { await app?.close(); });

  async function createApplication() {
    const module = await Test.createTestingModule({ controllers: [AdminController], providers: [AdminRoleGuard, { provide: OpaqueSessionService, useValue: opaqueSessionServiceTestDouble }, { provide: RuntimeConfigService, useValue: { value: config } }, { provide: AdminService, useValue: { dashboard: async () => ({ activeBookings: 2, clients: 1, today: [], nextWeek: [] }) } }] }).compile();
    const created = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(created, config); await created.init(); await created.getHttpAdapter().getInstance().ready(); app = created; return created;
  }

  async function cookie(roles: string[], name = "sb_admin_session", mfaVerified = true) {
    const token = await new SignJWT({ email: "operator@example.test", email_verified: true, roles, ...(mfaVerified ? { amr: ["pwd", "otp"] } : { amr: ["pwd"] }) }).setProtectedHeader({ alg: "HS256" }).setSubject("admin-subject").setIssuer("studio-balance-web").setAudience("studio-balance-api").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(config.sessionSecret));
    return `${name}=${token}`;
  }

  it("rejects a request without the separate admin session", async () => {
    const response = await (await createApplication()).inject({ method: "GET", url: "/api/v1/admin/dashboard" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("denies a client role even inside the admin cookie", async () => {
    const response = await (await createApplication()).inject({ method: "GET", url: "/api/v1/admin/dashboard", headers: { cookie: await cookie(["client"]) } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
  });

  it("allows an administrator", async () => {
    const response = await (await createApplication()).inject({ method: "GET", url: "/api/v1/admin/dashboard", headers: { cookie: await cookie(["admin"]) } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ activeBookings: 2, clients: 1 });
  });

  it("allows an MFA-proven web session with an administrator role", async () => {
    const response = await (await createApplication()).inject({ method: "GET", url: "/api/v1/admin/dashboard", headers: { cookie: await cookie(["client", "admin"], "sb_session") } });
    expect(response.statusCode).toBe(200);
  });

  it("rejects an administrator role in a web session without OTP assurance", async () => {
    const response = await (await createApplication()).inject({ method: "GET", url: "/api/v1/admin/dashboard", headers: { cookie: await cookie(["client", "admin"], "sb_session", false) } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "MFA_REQUIRED" } });
  });

  it("does not let a legacy admin cookie shadow an MFA-proven web session", async () => {
    const legacyAdmin = await cookie(["admin"], "sb_admin_session", false);
    const provenWeb = await cookie(["client", "admin"], "sb_session", true);
    const response = await (await createApplication()).inject({ method: "GET", url: "/api/v1/admin/dashboard", headers: { cookie: `${legacyAdmin}; ${provenWeb}` } });
    expect(response.statusCode).toBe(200);
  });
});

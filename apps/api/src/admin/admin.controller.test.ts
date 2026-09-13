import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  const updateSession = vi.fn(async (id: string) => ({ id }));
  afterEach(async () => { await app?.close(); });

  async function createApplication() {
    const module = await Test.createTestingModule({ controllers: [AdminController], providers: [AdminRoleGuard, { provide: OpaqueSessionService, useValue: opaqueSessionServiceTestDouble }, { provide: RuntimeConfigService, useValue: { value: config } }, { provide: AdminService, useValue: { dashboard: async () => ({ activeBookings: 2, clients: 1, today: [], nextWeek: [], metrics: { reservationsThisWeek: 0, attendedThisMonth: 0, noShowsThisMonth: 0, lateCancellationsThisMonth: 0, attendanceRate90Days: null, estimatedAttendedValueThisMonthCents: 0 }, classPopularity: [], weeklyAttendance: [] }), updateSession } }] }).compile();
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

  it("requires a client-facing reason when an administrator changes a session", async () => {
    const payload = { classTypeId: "20000000-0000-4000-8000-000000000001", instructorId: "10000000-0000-4000-8000-000000000005", startAt: "2026-09-16T06:00:00.000Z", durationMinutes: 60, arrivalLeadMinutes: 10, locationName: "Studio Balance", locationAddress: "Ruská 10, 792 01 Bruntál", priceCents: 25000, capacity: 10, equipment: "Barre", suitability: "Pro všechny" };
    const current = await createApplication();
    const headers = { cookie: await cookie(["admin"]) };
    expect((await current.inject({ method: "PATCH", url: "/api/v1/admin/sessions/71ff7570-dabb-488b-bb6e-43e36ddc602e", headers, payload })).statusCode).toBe(400);
    const response = await current.inject({ method: "PATCH", url: "/api/v1/admin/sessions/71ff7570-dabb-488b-bb6e-43e36ddc602e", headers, payload: { ...payload, changeReason: "Ranní Barre nově začíná v 8:00." } });
    expect(response.statusCode).toBe(200);
    expect(updateSession).toHaveBeenCalledWith("71ff7570-dabb-488b-bb6e-43e36ddc602e", { ...payload, changeReason: "Ranní Barre nově začíná v 8:00." }, expect.any(Object));
  });
});

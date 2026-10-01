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
  const previewScheduleChange = vi.fn(async () => ({ previewToken: "c".repeat(64), terms: [], exceptions: [], slots: [], rulesChanged: 1, sessionsChanged: 0, activeBookings: 0, cancelledSessionsKept: 0 }));
  const applyScheduleChange = vi.fn(async () => ({ rulesChanged: 1, sessionsChanged: 0 }));
  const updateSessionCapacity = vi.fn(async (id: string) => ({id}));
  const updateSession = vi.fn(async (id: string) => ({ id }));
  const updateWeeklyRule = vi.fn(async (id: string, active: boolean) => ({ id, active }));
  const previewClassPrice = vi.fn(async () => ({ className: "Barre", weeklyRulesChanged: 2, sessionsChanged: 3, activeBookings: 1, bookedPricesChanged: 0, blockedBookings: 0, previewToken: "a".repeat(64) }));
  const applyClassPrice = vi.fn(async () => ({ className: "Barre", weeklyRulesChanged: 2, sessionsChanged: 3, activeBookings: 1, bookedPricesChanged: 0, blockedBookings: 0, previewToken: "a".repeat(64) }));
  const previewWeeklyRuleEdit = vi.fn(async () => ({ className: "Barre", futureSessions: 3, bookedSessions: 1, activeBookings: 1, manualSessions: 0, previewToken: "b".repeat(64) }));
  const applyWeeklyRuleEdit = vi.fn(async () => ({ id: "71ff7570-dabb-488b-bb6e-43e36ddc602e", futureSessions: 3, activeBookings: 1 }));
  const changeScheduleBatch = vi.fn(async () => ({ changedSessions: 1, notifiedBookings: 0 }));
  afterEach(async () => { await app?.close(); });

  async function createApplication() {
    const module = await Test.createTestingModule({ controllers: [AdminController], providers: [AdminRoleGuard, { provide: OpaqueSessionService, useValue: opaqueSessionServiceTestDouble }, { provide: RuntimeConfigService, useValue: { value: config } }, { provide: AdminService, useValue: { dashboard: async () => ({ activeBookings: 2, clients: 1, today: [], nextWeek: [], metrics: { reservationsThisWeek: 0, attendedThisMonth: 0, noShowsThisMonth: 0, lateCancellationsThisMonth: 0, attendanceRate90Days: null, estimatedAttendedValueThisMonthCents: 0 }, classPopularity: [], weeklyAttendance: [] }), updateSession, updateSessionCapacity, previewScheduleChange, applyScheduleChange, updateWeeklyRule, previewWeeklyRuleEdit, applyWeeklyRuleEdit, changeScheduleBatch, previewClassPrice, applyClassPrice } }] }).compile();
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

  it("protects class pricing with admin MFA and a reviewed token", async () => {
    const current = await createApplication();
    const payload = { classTypeId: "20000000-0000-4000-8000-000000000001", priceCents: 27000, updateBookedPrices: false, reason: "Nový ceník lekcí." };
    expect((await current.inject({ method: "POST", url: "/api/v1/admin/prices/preview", payload })).statusCode).toBe(401);
    expect((await current.inject({ method: "POST", url: "/api/v1/admin/prices/preview", headers: { cookie: await cookie(["client"]) }, payload })).statusCode).toBe(403);
    const headers = { cookie: await cookie(["admin"]) };
    expect((await current.inject({ method: "POST", url: "/api/v1/admin/prices/preview", headers, payload })).statusCode).toBe(201);
    expect((await current.inject({ method: "POST", url: "/api/v1/admin/prices/apply", headers, payload: { ...payload, previewToken: "bad" } })).statusCode).toBe(400);
    expect((await current.inject({ method: "POST", url: "/api/v1/admin/prices/apply", headers, payload: { ...payload, previewToken: "a".repeat(64) } })).statusCode).toBe(201);
    expect(applyClassPrice).toHaveBeenCalledWith({ ...payload, previewToken: "a".repeat(64) }, expect.any(Object));
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

  it("allows only an MFA-proven administrator to pause future weekly generation", async () => {
    const id = "71ff7570-dabb-488b-bb6e-43e36ddc602e";
    const current = await createApplication();
    const url = `/api/v1/admin/weekly-rules/${id}`;
    const payload = { active: false };
    expect((await current.inject({ method: "PATCH", url, headers: { cookie: await cookie(["client"]) }, payload })).statusCode).toBe(403);
    expect((await current.inject({ method: "PATCH", url, headers: { cookie: await cookie(["admin"], "sb_session", false) }, payload })).statusCode).toBe(403);
    expect((await current.inject({ method: "PATCH", url, headers: { cookie: await cookie(["admin"]) }, payload: { active: "false" } })).statusCode).toBe(400);
    const response = await current.inject({ method: "PATCH", url, headers: { cookie: await cookie(["admin"]) }, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id, active: false });
    expect(updateWeeklyRule).toHaveBeenCalledWith(id, false, expect.any(Object));
  });

  it("protects a reviewed weekly rule edit with admin MFA", async () => {
    const id = "71ff7570-dabb-488b-bb6e-43e36ddc602e";
    const url = `/api/v1/admin/weekly-rules/${id}`;
    const payload = { weekday: 3, localStartTime: "08:00", instructorId: "10000000-0000-4000-8000-000000000005", capacity: 8, bookingLeadDays: 30, reason: "Potvrzená změna rozvrhu." };
    const current = await createApplication();
    expect((await current.inject({ method: "POST", url: `${url}/preview`, payload })).statusCode).toBe(401);
    expect((await current.inject({ method: "POST", url: `${url}/preview`, headers: { cookie: await cookie(["admin"], "sb_session", false) }, payload })).statusCode).toBe(403);
    const headers = { cookie: await cookie(["admin"]) };
    expect((await current.inject({ method: "POST", url: `${url}/preview`, headers, payload: { ...payload, capacity: 0 } })).statusCode).toBe(400);
    expect((await current.inject({ method: "POST", url: `${url}/preview`, headers, payload })).statusCode).toBe(201);
    expect((await current.inject({ method: "POST", url: `${url}/apply`, headers, payload: { ...payload, previewToken: "bad" } })).statusCode).toBe(400);
    expect((await current.inject({ method: "POST", url: `${url}/apply`, headers, payload: { ...payload, previewToken: "b".repeat(64) } })).statusCode).toBe(201);
    expect(applyWeeklyRuleEdit).toHaveBeenCalledWith(id, { ...payload, previewToken: "b".repeat(64) }, expect.any(Object));
  });

  it("accepts a valid local time for a dated batch move", async () => {
    const current = await createApplication();
    const payload = { action: "move", classTypeId: "20000000-0000-4000-8000-000000000001",
      from: "2026-10-01T00:00:00+02:00", to: "2026-11-01T00:00:00+01:00",
      reason: "Jednorázový přesun vypsaných termínů.", sourceWeekday: 3, targetWeekday: 5, targetTime: "17:30" };
    const response = await current.inject({ method: "POST", url: "/api/v1/admin/sessions/batch",
      headers: { cookie: await cookie(["admin"]) }, payload });
    expect(response.statusCode).toBe(201);
    expect(changeScheduleBatch).toHaveBeenCalledWith(payload, expect.any(Object));
  });
  it("guards date-scoped changes with MFA and validates scope and confirmation",async()=>{
    const current=await createApplication();const payload={ruleIds:["71ff7570-dabb-488b-bb6e-43e36ddc602e"],from:"2026-10-08",operation:"edit",capacity:14,reopenCancelled:false,updateBookedPrices:false,reason:"Nová kapacita kruhových tréninků."};
    expect((await current.inject({method:"POST",url:"/api/v1/admin/schedule-changes/preview",payload})).statusCode).toBe(401);
    expect((await current.inject({method:"POST",url:"/api/v1/admin/schedule-changes/preview",headers:{cookie:await cookie(["admin"],"sb_admin_session",false)},payload})).statusCode).toBe(403);
    const headers={cookie:await cookie(["admin"])};
    expect((await current.inject({method:"POST",url:"/api/v1/admin/schedule-changes/preview",headers,payload:{...payload,from:"2026-02-30"}})).statusCode).toBe(400);
    expect((await current.inject({method:"POST",url:"/api/v1/admin/schedule-changes/preview",headers,payload:{...payload,capacity:0}})).statusCode).toBe(400);
    expect((await current.inject({method:"POST",url:"/api/v1/admin/schedule-changes/preview",headers,payload})).statusCode).toBe(201);
    expect((await current.inject({method:"POST",url:"/api/v1/admin/schedule-changes/apply",headers,payload})).statusCode).toBe(400);
    expect((await current.inject({method:"POST",url:"/api/v1/admin/schedule-changes/apply",headers,payload:{...payload,previewToken:"c".repeat(64)}})).statusCode).toBe(201);
    expect((await current.inject({method:"PATCH",url:"/api/v1/admin/sessions/71ff7570-dabb-488b-bb6e-43e36ddc602e/capacity",headers,payload:{capacity:14}})).statusCode).toBe(200);
  });

});

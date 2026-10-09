import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpaqueSessionService } from "../auth/opaque-session.service.js";
import { opaqueSessionServiceTestDouble } from "../auth/session.test-support.js";
import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
import { AdminRoleGuard } from "./admin-role.guard.js";
import { InstructorRecordsController } from "./instructor-records.controller.js";
import { InstructorRecordsService } from "./instructor-records.service.js";

const config: RuntimeConfig = { apiPort: 3001, databaseUrl: "postgresql://unused", environment: "test", logLevel: "error", oidc: { issuer: "http://localhost:8081/realms/studio-balance", webClientId: "web", webClientSecret: "web-secret", adminClientId: "admin", adminClientSecret: "admin-secret" }, sessionSecret: "test-session-secret-that-is-long-enough-to-be-safe", version: "test" };
const id = "71ff7570-dabb-488b-bb6e-43e36ddc602e";
const payload = { instructorId: "10000000-0000-4000-8000-000000000005", startAt: "2026-10-08T15:00:00.000Z", endAt: "2026-10-08T16:00:00.000Z", rewardCents: null, absentBookingIds: [], rosterToken: "a".repeat(64), expectedVersion: null, reason: "Potvrzení odučené lekce." };

describe("instructor records administration contract", () => {
  let app: NestFastifyApplication | undefined;
  const listMonth = vi.fn(async (month: string) => ({ month, timeZone: "Europe/Prague", summary: [], records: [], unconfirmedSessions: [] }));
  const getCompletion = vi.fn(async () => ({ record: null, bookings: [] }));
  const complete = vi.fn(async () => ({ record: { version: 1 }, attendedCount: 2, noShowCount: 0 }));
  afterEach(async () => { await app?.close(); vi.clearAllMocks(); });

  async function application() {
    const module = await Test.createTestingModule({ controllers: [InstructorRecordsController], providers: [AdminRoleGuard,
      { provide: OpaqueSessionService, useValue: opaqueSessionServiceTestDouble },
      { provide: RuntimeConfigService, useValue: { value: config } },
      { provide: InstructorRecordsService, useValue: { listMonth, getCompletion, complete } }] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(app, config); await app.init(); await app.getHttpAdapter().getInstance().ready(); return app;
  }
  async function cookie(roles: string[], mfaVerified = true) {
    const token = await new SignJWT({ email: "operator@example.test", email_verified: true, roles, amr: mfaVerified ? ["pwd", "otp"] : ["pwd"] })
      .setProtectedHeader({ alg: "HS256" }).setSubject("operator").setIssuer("studio-balance-web").setAudience("studio-balance-api")
      .setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(config.sessionSecret));
    return `sb_admin_session=${token}`;
  }

  it("requires administrator MFA for reads and one-step completion", async () => {
    const current = await application();
    for (const request of [{ method: "GET" as const, url: "/api/v1/admin/instructor-records?month=2026-10" }, { method: "GET" as const, url: `/api/v1/admin/sessions/${id}/completion` }, { method: "POST" as const, url: `/api/v1/admin/sessions/${id}/completion`, payload }]) {
      expect((await current.inject(request)).statusCode).toBe(401);
      expect((await current.inject({ ...request, headers: { cookie: await cookie(["client"]) } })).statusCode).toBe(403);
      const missingMfa = await current.inject({ ...request, headers: { cookie: await cookie(["admin"], false) } });
      expect(missingMfa.statusCode).toBe(403);
      expect(missingMfa.json()).toMatchObject({ error: { code: "MFA_REQUIRED", requestId: expect.any(String) } });
    }
    expect(complete).not.toHaveBeenCalled();
  });

  it("validates month boundaries and keeps operational evidence private", async () => {
    const current = await application(); const headers = { cookie: await cookie(["admin"]) };
    for (const query of ["", "?month=2026-13", "?month=2026-01-01", "?month=2026-10&extra=yes", "?month=2026-10&month=2026-11"]) {
      const response = await current.inject({ method: "GET", url: `/api/v1/admin/instructor-records${query}`, headers });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", requestId: expect.any(String) } });
    }
    const response = await current.inject({ method: "GET", url: "/api/v1/admin/instructor-records?month=2026-10", headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers.vary).toBe("Cookie");
    expect(listMonth).toHaveBeenCalledWith("2026-10");
  });

  it("rejects unknown IDs and malformed completion without calling the service", async () => {
    const current = await application(); const headers = { cookie: await cookie(["admin"]) };
    expect((await current.inject({ method: "GET", url: "/api/v1/admin/sessions/invalid/completion", headers })).statusCode).toBe(404);
    for (const data of [{ ...payload, rewardCents: -1 }, { ...payload, rewardCents: undefined }, { ...payload, expectedVersion: 0 },
      { ...payload, rosterToken: "bad" }, { ...payload, reason: " " }, { ...payload, absentBookingIds: [id, id] }, { ...payload, attendance: "attended" }]) {
      const response = await current.inject({ method: "POST", url: `/api/v1/admin/sessions/${id}/completion`, headers, payload: data });
      expect(response.statusCode).toBe(400);
    }
    expect(complete).not.toHaveBeenCalled();
    const response = await current.inject({ method: "POST", url: `/api/v1/admin/sessions/${id}/completion`, headers, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ record: { version: 1 }, attendedCount: 2, noShowCount: 0 });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(complete).toHaveBeenCalledWith(id, payload, expect.objectContaining({ session: expect.objectContaining({ subject: "operator" }) }));
  });
});

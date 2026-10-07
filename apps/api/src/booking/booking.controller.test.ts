import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { configureHttp } from "../http/configure-http.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { BookingController } from "./booking.controller.js";
import { BookingService, CURRENT_TERMS_VERSION } from "./booking.service.js";

const config = { environment: "test", version: "test", logLevel: "error" } as RuntimeConfig;
const base = { sessionId: randomUUID(), termsVersion: CURRENT_TERMS_VERSION, termsAccepted: true };
const create = vi.fn(async (input: unknown) => input);
const listMine = vi.fn(async () => ({ items: [], nextCursor: null }));

describe("booking companion HTTP contract", () => {
  let app: NestFastifyApplication;
  beforeEach(async () => {
    create.mockClear(); listMine.mockClear();
    const module = await Test.createTestingModule({ controllers: [BookingController],
      providers: [{ provide: BookingService, useValue: { create, listMine } }] })
      .overrideGuard(SessionAuthGuard).useValue({ canActivate: (context: { switchToHttp: () => { getRequest: () => { headers: Record<string,string>; studioSession?: object } } }) => {
        const request = context.switchToHttp().getRequest();
        if (!request.headers.authorization) return false;
        request.studioSession = { subject: "owner", roles: ["client"] }; return true;
      } }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(app,config); await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  afterEach(async () => { await app.close(); });
  function post(payload: object, authenticated = true) {
    return app.inject({ method: "POST", url: "/api/v1/bookings", payload,
      headers: { "idempotency-key": randomUUID(), ...(authenticated ? { authorization: "synthetic-local-test" } : {}) } });
  }
  it("accepts a single seat or one named companion with explicit responsibility", async () => {
    expect((await post(base)).statusCode).toBe(201);
    const result = await post({ ...base, companionName: "  Jana Nová  ", companionResponsibilityAccepted: true });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({ companionName: "Jana Nová", companionResponsibilityAccepted: true });
  });
  it.each([
    { companionName: "Jana" },
    { companionResponsibilityAccepted: true },
    { companionName: "Jana", companionResponsibilityAccepted: false },
    { companionName: " ", companionResponsibilityAccepted: true },
    { companionName: "X".repeat(201), companionResponsibilityAccepted: true },
    { companionName: "Jana\nNová", companionResponsibilityAccepted: true },
    { companionName: "Jana", companionResponsibilityAccepted: true, quantity: 3 },
    { termsVersion: "2026-08-04" }
  ])("rejects malformed input %# with the standard error response", async (extra) => {
    const response = await post({ ...base, ...extra });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", message: expect.any(String), requestId: expect.any(String) } });
    expect(create).not.toHaveBeenCalled();
  });
  it("keeps the authenticated guard on reservation creation", async () => {
    expect((await post({ ...base, companionName: "Jana", companionResponsibilityAccepted: true },false)).statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it("validates bounded client booking pages and preserves authentication", async () => {
    const headers = { authorization: "synthetic-local-test" };
    expect((await app.inject({ method: "GET", url: "/api/v1/me/bookings?limit=1" })).statusCode).toBe(403);
    for (const query of ["limit=0", "limit=101", "limit=NaN", "from=2026-02-30", "from=0000-01-01", "period=other", "cursor=not%20a%20cursor", "sessionId=" + randomUUID()]) {
      const response = await app.inject({ method: "GET", url: `/api/v1/me/bookings?${query}`, headers });
      expect(response.statusCode,query).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", requestId: expect.any(String) } });
    }
    expect(listMine).not.toHaveBeenCalled();
    const response = await app.inject({ method: "GET", url: "/api/v1/me/bookings?limit=100&period=upcoming&from=2026-10-25&through=2026-10-25", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], nextCursor: null });
    expect(listMine).toHaveBeenCalledWith(expect.objectContaining({ subject: "owner" }), { limit: 100, period: "upcoming", from: "2026-10-25", through: "2026-10-25" });
  });

});

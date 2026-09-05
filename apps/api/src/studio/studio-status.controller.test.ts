import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminStudioStatusController, StudioStatusController } from "./studio-status.controller.js";
import { StudioStatusService } from "./studio-status.service.js";
import { AdminRoleGuard } from "../admin/admin-role.guard.js";
import { OpaqueSessionService } from "../auth/opaque-session.service.js";
import { opaqueSessionServiceTestDouble } from "../auth/session.test-support.js";
import { RuntimeConfigService, loadRuntimeConfig } from "../config/runtime-config.js";

import { configureHttp } from "../http/configure-http.js";



const secret = "local-test-secret-that-is-at-least-32-characters";
const config = loadRuntimeConfig({ APP_ENV: "test", APP_VERSION: "test", SESSION_SECRET: secret, LOG_LEVEL: "error" });

describe("studio status REST contract", () => {
  let app: NestFastifyApplication;
  afterEach(async () => { await app?.close(); });
  async function setup() {
    const state = { open: false, announcement: "Momentálně zavřeno", requestedOpen: false, registrationSynced: true };
    const update = vi.fn(async () => state);
    const module = await Test.createTestingModule({ controllers: [StudioStatusController, AdminStudioStatusController], providers: [AdminRoleGuard,
      { provide: RuntimeConfigService, useValue: { value: config } }, { provide: OpaqueSessionService, useValue: opaqueSessionServiceTestDouble },
      { provide: StudioStatusService, useValue: { get: async () => state, update } }
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(app, config); await app.init(); await app.getHttpAdapter().getInstance().ready();
    return update;
  }
  async function cookie(roles: string[]) {
    const token = await new SignJWT({ email: "operator@example.test", email_verified: true, roles, amr: ["pwd","otp"] }).setProtectedHeader({ alg: "HS256" }).setSubject("admin")
      .setIssuer("studio-balance-web").setAudience("studio-balance-api").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    return `sb_admin_session=${token}`;
  }
  it("exposes only public no-store fields matching OpenAPI", async () => {
    await setup(); const response = await app.inject({ method: "GET", url: "/api/v1/studio-status" });
    expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
    const spec = JSON.parse(await readFile(new URL("../../../../openapi/openapi.json", import.meta.url), "utf8"));
    expect(Object.keys(response.json()).sort()).toEqual(spec.components.schemas.StudioStatus.required.sort());
  });
  it("rejects anonymous and client changes, validates admin body and accepts an admin change", async () => {
    const update = await setup();
    for (const [headers, status] of [[{},401],[{ cookie: await cookie(["client"]) },403]] as const) {
      const response = await app.inject({ method: "PUT", url: "/api/v1/admin/studio-status", headers, payload: { open: true } });
      expect(response.statusCode).toBe(status); expect(response.json().error.requestId).toBeTruthy();
    }
    expect(update).not.toHaveBeenCalled();
    const headers = { cookie: await cookie(["admin"]) };
    expect((await app.inject({ method: "PUT", url: "/api/v1/admin/studio-status", headers, payload: { open: "yes" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/v1/admin/studio-status", headers, payload: { open: true } })).statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(true, "admin", expect.any(String));
  });
});

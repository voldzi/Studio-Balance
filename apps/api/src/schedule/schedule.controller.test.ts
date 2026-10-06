import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";
import { ScheduleController } from "./schedule.controller.js";
import { ScheduleService } from "./schedule.service.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";

const id = "20000000-0000-4000-8000-000000000005";
describe("public schedule cache contract", () => {
  let app: NestFastifyApplication;
  afterEach(async () => { await app?.close(); });
  it("prevents intermediary caching of catalog and schedule changes", async () => {
    const module = await Test.createTestingModule({ controllers: [ScheduleController], providers: [
      { provide: ScheduleService, useValue: {
        listClassTypes: async () => ({ items: [] }), getClassType: async () => ({ id }),
        listSessions: async () => ({ items: [], timezone: "Europe/Prague" }), getSession: async () => ({ id })
      } }
    ] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(app, loadRuntimeConfig({ APP_ENV: "test", APP_VERSION: "test", LOG_LEVEL: "error" }));
    await app.init(); await app.getHttpAdapter().getInstance().ready();
    for (const path of ["/api/v1/class-types", "/api/v1/class-types/barre", "/api/v1/sessions", `/api/v1/sessions/${id}`]) {
      const response = await app.inject({ method: "GET", url: path });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
    }
  });
});

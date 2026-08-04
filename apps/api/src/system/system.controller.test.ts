import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { DatabaseService } from "../database/database.service.js";
import { configureHttp, requestIdFromHeader } from "../http/configure-http.js";
import { SystemController } from "./system.controller.js";

const config: RuntimeConfig = {
  apiPort: 3001,
  databaseUrl: "postgresql://unused",
  environment: "test",
  logLevel: "error",
  sessionSecret: "test-session-secret-that-is-long-enough-to-be-safe",
  version: "test"
};

describe("system API contract", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function createApplication(checkReadiness: () => Promise<void>): Promise<NestFastifyApplication> {
    const module = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [
        { provide: DatabaseService, useValue: { checkReadiness } },
        { provide: RuntimeConfigService, useValue: { value: config } }
      ]
    }).compile();
    const created = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        logger: false,
        requestIdHeader: "x-request-id"
      }),
      { logger: false }
    );
    configureHttp(created, config);
    await created.init();
    await created.getHttpAdapter().getInstance().ready();
    app = created;
    return created;
  }

  it("returns liveness without touching the database", async () => {
    const checkReadiness = vi.fn(async () => undefined);
    const current = await createApplication(checkReadiness);
    const response = await current.inject({ method: "GET", url: "/health", headers: { "x-request-id": "req_test" } });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe("req_test");
    expect(response.json()).toMatchObject({ service: "studio-balance-api", status: "ok", version: "test" });
    expect(checkReadiness).not.toHaveBeenCalled();
  });

  it("rejects an unsafe incoming request ID", () => {
    expect(requestIdFromHeader("unsafe value with spaces")).toMatch(/^req_[0-9a-f-]+$/);
  });

  it("returns the standard error contract when the database is unavailable", async () => {
    const current = await createApplication(async () => {
      throw new Error("database unavailable");
    });
    const response = await current.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Služba je dočasně nedostupná. Zkuste to prosím znovu.",
        requestId: response.headers["x-request-id"]
      }
    });
  });
});

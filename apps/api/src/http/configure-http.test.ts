import "reflect-metadata";

import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { describe, expect, it } from "vitest";

import type { RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "./configure-http.js";

@Controller()
class PrivacyFixtureController {
  @Get(["api/v1/me", "api/v1/me/bookings", "api/v1/me/favorites", "api/v1/admin/users", "api/v1/admin/fees", "api/internal/sessions"])
  privateResponse() { return { email: "synthetic@example.test" }; }

  @Get("api/v1/admin/denied")
  denied() { throw new HttpException({ code: "AUTHENTICATION_REQUIRED", message: "Přihlaste se." }, HttpStatus.UNAUTHORIZED); }

  @Get(["api/v1/class-types", "api/v1/mechanics"])
  publicResponse() { return { name: "Public content" }; }
}

describe("private HTTP responses", () => {
  it("prevents caching private success and error responses without changing public content policy", async () => {
    const module = await Test.createTestingModule({ controllers: [PrivacyFixtureController] }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
    configureHttp(app, { environment: "test", version: "test", logLevel: "error" } as RuntimeConfig);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      for (const url of ["/api/v1/me", "/api/v1/me/bookings", "/api/v1/me/favorites", "/api/v1/admin/users", "/api/v1/admin/fees", "/api/internal/sessions", "/api/v1/admin/denied", "/api/v1/me?view=profile"]) {
        const response = await app.inject({ method: "GET", url });
        expect(response.headers["cache-control"], url).toBe("private, no-store");
        expect(response.headers.vary, url).toBe("Cookie");
        expect(response.statusCode, url).toBe(url.endsWith("denied") ? 401 : 200);
      }
      for (const url of ["/api/v1/class-types", "/api/v1/mechanics"]) {
        const response = await app.inject({ method: "GET", url });
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBeUndefined();
      }
    } finally {
      await app.close();
    }
  });
});

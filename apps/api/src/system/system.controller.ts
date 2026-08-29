import { Controller, Get, HttpException, HttpStatus, Inject } from "@nestjs/common";

import type { components } from "@studiobalance/contracts";

import { RuntimeConfigService } from "../config/runtime-config.js";
import { DatabaseService } from "../database/database.service.js";

type HealthResponse = components["schemas"]["HealthResponse"];

@Controller()
export class SystemController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RuntimeConfigService) private readonly config: RuntimeConfigService
  ) {}

  @Get("health")
  health(): HealthResponse {
    return this.response();
  }

  @Get("ready")
  async ready(): Promise<HealthResponse> {
    try {
      await this.database.checkReadiness();
      return this.response();
    } catch {
      throw new HttpException(
        { code: "DEPENDENCY_UNAVAILABLE", message: "The service is temporarily unavailable." },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  private response(): HealthResponse {
    return {
      service: "studio-balance-api",
      status: "ok",
      timestamp: new Date().toISOString(),
      version: this.config.value.version
    };
  }
}

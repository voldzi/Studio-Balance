import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";

import { RuntimeConfigService } from "../config/runtime-config.js";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(RuntimeConfigService) config: RuntimeConfigService) {
    this.pool = new Pool({
      connectionString: config.value.databaseUrl,
      max: 10
    });
  }

  async checkReadiness(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

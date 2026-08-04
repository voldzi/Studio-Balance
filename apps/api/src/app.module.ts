import { Module } from "@nestjs/common";

import { RuntimeConfigService } from "./config/runtime-config.js";
import { DatabaseService } from "./database/database.service.js";
import { SystemController } from "./system/system.controller.js";

@Module({
  controllers: [SystemController],
  providers: [RuntimeConfigService, DatabaseService]
})
export class AppModule {}

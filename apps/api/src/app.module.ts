import { Module } from "@nestjs/common";

import { RuntimeConfigService } from "./config/runtime-config.js";
import { MeController } from "./account/me.controller.js";
import { SessionAuthGuard } from "./auth/session-auth.guard.js";
import { DatabaseService } from "./database/database.service.js";
import { SystemController } from "./system/system.controller.js";

@Module({
  controllers: [SystemController, MeController],
  providers: [RuntimeConfigService, DatabaseService, SessionAuthGuard]
})
export class AppModule {}

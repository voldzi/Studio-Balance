import { Module } from "@nestjs/common";

import { RuntimeConfigService } from "./config/runtime-config.js";
import { MeController } from "./account/me.controller.js";
import { AccountService } from "./account/account.service.js";
import { SessionAuthGuard } from "./auth/session-auth.guard.js";
import { DatabaseService } from "./database/database.service.js";
import { SystemController } from "./system/system.controller.js";
import { ScheduleController } from "./schedule/schedule.controller.js";
import { ScheduleService } from "./schedule/schedule.service.js";
import { BookingController } from "./booking/booking.controller.js";
import { BookingService } from "./booking/booking.service.js";

@Module({
  controllers: [SystemController, ScheduleController, MeController, BookingController],
  providers: [RuntimeConfigService, DatabaseService, SessionAuthGuard, ScheduleService, AccountService, BookingService]
})
export class AppModule {}

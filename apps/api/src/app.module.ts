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
import { AdminController } from "./admin/admin.controller.js";
import { AdminRoleGuard } from "./admin/admin-role.guard.js";
import { AdminService } from "./admin/admin.service.js";
import { AdminReviewsController, ReviewsController } from "./content/reviews.controller.js";
import { ReviewsService } from "./content/reviews.service.js";

@Module({
  controllers: [SystemController, ScheduleController, ReviewsController, MeController, BookingController, AdminController, AdminReviewsController],
  providers: [RuntimeConfigService, DatabaseService, SessionAuthGuard, AdminRoleGuard, ScheduleService, ReviewsService, AccountService, BookingService, AdminService]
})
export class AppModule {}

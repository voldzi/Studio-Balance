import { TeamController, AdminTeamController } from "./content/team.controller.js";
import { Module } from "@nestjs/common";

import { RuntimeConfigService } from "./config/runtime-config.js";
import { MeController } from "./account/me.controller.js";
import { AccountService } from "./account/account.service.js";
import { SessionAuthGuard } from "./auth/session-auth.guard.js";
import { OpaqueSessionService } from "./auth/opaque-session.service.js";
import { InternalSessionGuard } from "./auth/internal-session.guard.js";
import { InternalSessionController } from "./auth/internal-session.controller.js";
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
import { AdminTransformationsController, TransformationsController } from "./content/transformations.controller.js";
import { TransformationsService } from "./content/transformations.service.js";
import { AdminMediaController, MediaController } from "./media/media.controller.js";
import { MediaStorageService } from "./media/media-storage.service.js";
import { AdminNewsController, NewsController } from "./content/news.controller.js";
import { NewsService } from "./content/news.service.js";

@Module({
  controllers: [TeamController, AdminTeamController, SystemController, ScheduleController, ReviewsController, TransformationsController, NewsController, MediaController, MeController, BookingController, AdminController, AdminReviewsController, AdminTransformationsController, AdminNewsController, AdminMediaController, InternalSessionController],
  providers: [RuntimeConfigService, DatabaseService, OpaqueSessionService, InternalSessionGuard, SessionAuthGuard, AdminRoleGuard, ScheduleService, ReviewsService, TransformationsService, NewsService, MediaStorageService, AccountService, BookingService, AdminService]
})
export class AppModule {}

import { Controller, Get, HttpException, HttpStatus, Inject, Param, Query } from "@nestjs/common";
import { z } from "zod";

import { ScheduleService } from "./schedule.service.js";

const uuid = z.string().uuid();

@Controller("api/v1")
export class ScheduleController {
  constructor(@Inject(ScheduleService) private readonly schedule: ScheduleService) {}

  @Get("class-types")
  listClassTypes() {
    return this.schedule.listClassTypes();
  }

  @Get("sessions")
  listSessions(@Query("from") fromValue?: string, @Query("to") toValue?: string) {
    const now = new Date();
    const from = fromValue ? new Date(fromValue) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = toValue ? new Date(toValue) : new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 93 * 86_400_000) {
      throw new HttpException({ code: "VALIDATION_ERROR", message: "Zvolte platný interval rozvrhu." }, HttpStatus.BAD_REQUEST);
    }
    return this.schedule.listSessions(from, to);
  }

  @Get("sessions/:sessionId")
  async getSession(@Param("sessionId") sessionId: string) {
    if (!uuid.safeParse(sessionId).success) {
      throw new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Termín nebyl nalezen." }, HttpStatus.NOT_FOUND);
    }
    const session = await this.schedule.getSession(sessionId);
    if (!session) throw new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Termín nebyl nalezen." }, HttpStatus.NOT_FOUND);
    return session;
  }
}

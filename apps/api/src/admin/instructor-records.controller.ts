import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AdminRoleGuard, type AdminRequest } from "./admin-role.guard.js";
import { InstructorRecordsService } from "./instructor-records.service.js";

const uuid = z.string().uuid();
export const sessionCompletionSchema = z.object({
  instructorId: uuid,
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  rewardCents: z.number().int().min(0).max(1_000_000).nullable(),
  absentBookingIds: z.array(uuid).max(500).refine((ids) => new Set(ids).size === ids.length),
  rosterToken: z.string().regex(/^[a-f0-9]{64}$/),
  expectedVersion: z.number().int().min(1).max(2_147_483_646).nullable(),
  reason: z.string().trim().min(3).max(1000)
}).strict();

@Controller("api/v1/admin")
@UseGuards(AdminRoleGuard)
export class InstructorRecordsController {
  constructor(@Inject(InstructorRecordsService) private readonly records: InstructorRecordsService) {}

  @Get("instructor-records")
  list(@Query() query: unknown) {
    const parsed = z.object({ month: z.string().regex(/^(20[0-9]{2})-(0[1-9]|1[0-2])$/) }).strict().safeParse(query);
    if (!parsed.success) throw validation();
    return this.records.listMonth(parsed.data.month);
  }

  @Get("sessions/:id/completion")
  completion(@Param("id") id: string) { return this.records.getCompletion(parseId(id)); }

  @Post("sessions/:id/completion")
  @HttpCode(HttpStatus.OK)
  complete(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) {
    const parsed = sessionCompletionSchema.safeParse(body);
    if (!parsed.success) throw validation();
    return this.records.complete(parseId(id), parsed.data, { requestId: request.id, session: request.studioSession! });
  }
}

function parseId(id: string) {
  if (!uuid.safeParse(id).success) throw new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Termín nebyl nalezen." }, HttpStatus.NOT_FOUND);
  return id;
}
function validation() { return new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte měsíc, čas a údaje potvrzené lekce." }, HttpStatus.BAD_REQUEST); }

import { Body, Controller, Get, Header, HttpException, HttpStatus, Inject, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { StudioStatusService } from "./studio-status.service.js";

@Controller("api/v1/studio-status")
export class StudioStatusController {
  constructor(@Inject(StudioStatusService) private readonly status: StudioStatusService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  async get() { const { open, announcement } = await this.status.get(); return { open, announcement }; }
}
@Controller("api/v1/admin/studio-status")
@UseGuards(AdminRoleGuard)
export class AdminStudioStatusController {
  constructor(@Inject(StudioStatusService) private readonly status: StudioStatusService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  get() { return this.status.get(); }
  @Put()
  @Header("Cache-Control", "no-store")
  update(@Req() request: AdminRequest, @Body() body: unknown) {
    const parsed = z.object({ open: z.boolean() }).strict().safeParse(body);
    if (!parsed.success) throw new HttpException({ code: "VALIDATION_ERROR", message: "Vyberte stav otevření studia." }, HttpStatus.BAD_REQUEST);
    return this.status.update(parsed.data.open, request.studioSession!.subject, request.id);
  }
}

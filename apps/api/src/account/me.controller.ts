import { Body, Controller, Get, HttpException, HttpStatus, Inject, Patch, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { SessionAuthGuard, type SessionRequest } from "../auth/session-auth.guard.js";
import { AccountService, profileResponse } from "./account.service.js";

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(30)
}).strict();

@Controller("api/v1")
export class MeController {
  constructor(@Inject(AccountService) private readonly accounts: AccountService) {}

  @Get("me")
  @UseGuards(SessionAuthGuard)
  async me(@Req() request: SessionRequest) {
    const session = request.studioSession!;
    const profile = await this.accounts.ensureProfile(session);
    return profileResponse(profile, session);
  }

  @Patch("me")
  @UseGuards(SessionAuthGuard)
  async updateMe(@Req() request: SessionRequest, @Body() body: unknown) {
    const input = updateProfileSchema.safeParse(body);
    if (!input.success) {
      throw new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte jméno, příjmení a telefon." }, HttpStatus.BAD_REQUEST);
    }
    const session = request.studioSession!;
    const profile = await this.accounts.updateProfile(session, input.data);
    return profileResponse(profile, session);
  }

  @Get("me/notifications")
  @UseGuards(SessionAuthGuard)
  async notifications(@Req() request: SessionRequest) {
    return this.accounts.listNotifications(request.studioSession!);
  }
}

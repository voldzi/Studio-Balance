import { Controller, Get, Req, UseGuards } from "@nestjs/common";

import type { components } from "@studiobalance/contracts";

import { SessionAuthGuard, type SessionRequest } from "../auth/session-auth.guard.js";

type MeResponse = components["schemas"]["MeResponse"];

@Controller("api/v1")
export class MeController {
  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@Req() request: SessionRequest): MeResponse {
    const session = request.studioSession!;
    return {
      subject: session.subject,
      email: session.email,
      emailVerified: session.emailVerified,
      roles: session.roles
    };
  }
}

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { type StudioSession } from "../auth/session.js";
import { OpaqueSessionService } from "../auth/opaque-session.service.js";

export type AdminRequest = FastifyRequest & { studioSession?: StudioSession };

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(@Inject(OpaqueSessionService) private readonly sessions: OpaqueSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const adminSession = await this.sessions.resolveCookie(request.headers.cookie, "admin");
    if (!adminSession) {
      throw new HttpException({ code: "AUTHENTICATION_REQUIRED", message: "Přihlaste se do administrace." }, HttpStatus.UNAUTHORIZED);
    }
    if (!adminSession.roles.some((role) => role === "admin" || role === "super_admin")) {
      throw new HttpException({ code: "PERMISSION_DENIED", message: "Pro tuto operaci nemáte oprávnění." }, HttpStatus.FORBIDDEN);
    }
    request.studioSession = adminSession;
    return true;
  }
}

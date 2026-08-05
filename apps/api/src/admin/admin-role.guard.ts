import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { RuntimeConfigService } from "../config/runtime-config.js";
import { verifyStudioSession, type StudioSession } from "../auth/session.js";

export type AdminRequest = FastifyRequest & { studioSession?: StudioSession };

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(@Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const session = await verifyStudioSession(request.headers.cookie, this.config.value.sessionSecret, "sb_admin_session");
    if (!session) {
      throw new HttpException({ code: "AUTHENTICATION_REQUIRED", message: "Přihlaste se do administrace." }, HttpStatus.UNAUTHORIZED);
    }
    if (!session.roles.some((role) => role === "admin" || role === "super_admin")) {
      throw new HttpException({ code: "PERMISSION_DENIED", message: "Pro tuto operaci nemáte oprávnění." }, HttpStatus.FORBIDDEN);
    }
    request.studioSession = session;
    return true;
  }
}

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
    const separateAdminSession = await this.sessions.resolveCookie(request.headers.cookie, "admin");
    const webSession = isMfaAdministrator(separateAdminSession)
      ? undefined
      : await this.sessions.resolveCookie(request.headers.cookie, "web");
    // Prefer a proven fallback admin session, but never let a legacy/unproven
    // admin cookie shadow a valid MFA-proven web session during migration.
    const session = isMfaAdministrator(separateAdminSession) ? separateAdminSession : webSession ?? separateAdminSession;
    if (!session) {
      throw new HttpException({ code: "AUTHENTICATION_REQUIRED", message: "Přihlaste se do administrace." }, HttpStatus.UNAUTHORIZED);
    }
    if (!session.roles.some((role) => role === "admin" || role === "super_admin")) {
      throw new HttpException({ code: "PERMISSION_DENIED", message: "Pro tuto operaci nemáte oprávnění." }, HttpStatus.FORBIDDEN);
    }
    if (!session.mfaVerified) {
      throw new HttpException({ code: "MFA_REQUIRED", message: "Administrace vyžaduje přihlášení s ověřovacím kódem." }, HttpStatus.FORBIDDEN);
    }
    request.studioSession = session;
    return true;
  }
}

function isMfaAdministrator(session: StudioSession | undefined): session is StudioSession {
  return Boolean(session?.mfaVerified && session.roles.some((role) => role === "admin" || role === "super_admin"));
}

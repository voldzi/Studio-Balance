import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { type StudioSession } from "./session.js";
import { OpaqueSessionService } from "./opaque-session.service.js";

export type SessionRequest = FastifyRequest & { studioSession?: StudioSession };

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(OpaqueSessionService) private readonly sessions: OpaqueSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const session = await this.sessions.resolveCookie(request.headers.cookie, "web");

    if (!session) {
      throw new HttpException(
        { code: "AUTHENTICATION_REQUIRED", message: "Pro pokračování se prosím přihlaste." },
        HttpStatus.UNAUTHORIZED
      );
    }

    request.studioSession = session;
    return true;
  }
}

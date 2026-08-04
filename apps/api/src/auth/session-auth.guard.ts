import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { RuntimeConfigService } from "../config/runtime-config.js";
import { verifyStudioSession, type StudioSession } from "./session.js";

export type SessionRequest = FastifyRequest & { studioSession?: StudioSession };

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly config: RuntimeConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const session = await verifyStudioSession(request.headers.cookie, this.config.value.sessionSecret);

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

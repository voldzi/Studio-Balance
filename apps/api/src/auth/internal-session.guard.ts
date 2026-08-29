import { createHmac, timingSafeEqual } from "node:crypto";

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { RuntimeConfigService } from "../config/runtime-config.js";

@Injectable()
export class InternalSessionGuard implements CanActivate {
  constructor(@Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const timestamp = headerValue(request.headers["x-studiobalance-internal-timestamp"]);
    const signature = headerValue(request.headers["x-studiobalance-internal-signature"]);
    const timestampValue = Number(timestamp);
    const route = request.routeOptions.url ?? request.url.split("?", 1)[0];
    if (!timestamp || !signature || !Number.isSafeInteger(timestampValue) || Math.abs(Date.now() - timestampValue) > 60_000) {
      throw denied();
    }
    const expected = createHmac("sha256", this.config.value.sessionSecret)
      .update(`${timestamp}:${request.method}:${route}`)
      .digest("base64url");
    const supplied = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (supplied.length !== expectedBytes.length || !timingSafeEqual(supplied, expectedBytes)) throw denied();
    return true;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function denied(): HttpException {
  return new HttpException({ code: "AUTHENTICATION_REQUIRED", message: "Interní požadavek nebyl ověřen." }, HttpStatus.UNAUTHORIZED);
}

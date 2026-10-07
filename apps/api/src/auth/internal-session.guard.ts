import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { RuntimeConfigService } from "../config/runtime-config.js";

@Injectable()
export class InternalSessionGuard implements CanActivate {
  private readonly usedNonces = new Map<string, number>();
  private lastSweepAt = 0;
  constructor(@Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest & { rawBody?: Buffer }>();
    const timestamp = headerValue(request.headers["x-studiobalance-internal-timestamp"]);
    const signature = headerValue(request.headers["x-studiobalance-internal-signature"]);
    const nonce = headerValue(request.headers["x-studiobalance-internal-nonce"]);
    const timestampValue = Number(timestamp);
    const route = request.routeOptions.url ?? request.url.split("?", 1)[0];
    const now = Date.now();
    if (!timestamp || !signature || !nonce || !/^[A-Za-z0-9_-]{22}$/.test(nonce) || !Buffer.isBuffer(request.rawBody) ||
      !Number.isSafeInteger(timestampValue) || Math.abs(now - timestampValue) > 60_000) {
      throw denied();
    }
    const expected = createHmac("sha256", this.config.value.sessionSecret)
      .update(`${timestamp}:${nonce}:${request.method}:${route}:${createHash("sha256").update(request.rawBody).digest("hex")}`)
      .digest("base64url");
    const supplied = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (supplied.length !== expectedBytes.length || !timingSafeEqual(supplied, expectedBytes)) throw denied();
    // The deployment has one API instance. Claim only authenticated nonces, never
    // evict a live claim, and fail closed if the bounded replay cache is full.
    if (now - this.lastSweepAt >= 5_000) {
      for (const [key, expiresAt] of this.usedNonces) if (expiresAt < now) this.usedNonces.delete(key);
      this.lastSweepAt = now;
    }
    const usedUntil = this.usedNonces.get(nonce);
    if (usedUntil !== undefined && usedUntil >= now) throw denied();
    if (this.usedNonces.size >= 10_000) {
      throw new HttpException({ code: "SERVICE_UNAVAILABLE", message: "Ověření je dočasně nedostupné. Zkuste požadavek znovu." }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    this.usedNonces.set(nonce, timestampValue + 60_000);
    return true;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function denied(): HttpException {
  return new HttpException({ code: "AUTHENTICATION_REQUIRED", message: "Interní požadavek nebyl ověřen." }, HttpStatus.UNAUTHORIZED);
}

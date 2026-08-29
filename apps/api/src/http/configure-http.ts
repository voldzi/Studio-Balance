import { randomUUID } from "node:crypto";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyServerOptions } from "fastify";

import type { RuntimeConfig } from "../config/runtime-config.js";
import { writeLog } from "../observability/structured-log.js";
import { ApiExceptionFilter } from "./api-exception.filter.js";

const acceptedRequestId = /^[A-Za-z0-9_-]{1,100}$/;

export function requestIdFromHeader(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && acceptedRequestId.test(candidate) ? candidate : `req_${randomUUID()}`;
}

export const generateRequestId: NonNullable<FastifyServerOptions["genReqId"]> = (request) =>
  requestIdFromHeader(request.headers["x-request-id"]);

export function configureHttp(app: NestFastifyApplication, config: RuntimeConfig): void {
  app.useGlobalFilters(new ApiExceptionFilter(config));

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", (request, reply, done) => {
    void reply.header("x-request-id", request.id);
    done();
  });
  fastify.addHook("onResponse", (request, reply, done) => {
    writeLog(config, "info", "request_completed", request.id, {
      method: request.method,
      path: request.routeOptions?.url ?? request.url,
      statusCode: reply.statusCode
    });
    done();
  });
}

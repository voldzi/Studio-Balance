import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { RuntimeConfig } from "../config/runtime-config.js";
import { writeLog } from "../observability/structured-log.js";

type DomainError = { code?: string; message?: string };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly config: RuntimeConfig) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = exception instanceof HttpException ? exception.getResponse() : undefined;
    const domainError = typeof response === "object" && response !== null ? (response as DomainError) : {};
    const code = domainError.code ?? (status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR");
    const message =
      status >= 500
        ? "Služba je dočasně nedostupná. Zkuste to prosím znovu."
        : (domainError.message ?? "Požadavek nelze zpracovat.");

    writeLog(this.config, status >= 500 ? "error" : "warn", "request_failed", request.id, {
      errorCode: code,
      exceptionName: status >= 500 && exception instanceof Error ? exception.name : undefined,
      method: request.method,
      path: request.routeOptions?.url ?? request.url,
      statusCode: status
    });

    void reply.status(status).send({
      error: {
        code,
        message,
        requestId: request.id
      }
    });
  }
}

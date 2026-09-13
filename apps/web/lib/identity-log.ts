import { randomUUID } from "node:crypto";

type IdentityOperation = "admin_login_start" | "client_login_start" | "password_change_start";

export function logIdentityFailure(request: Request, operation: IdentityOperation, error: unknown): string {
  const incomingRequestId = request.headers.get("x-request-id");
  const requestId = incomingRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID();
  const errorCode = error instanceof Error && error.message.startsWith("OIDC discovery")
    ? "OIDC_DISCOVERY_FAILED"
    : "OIDC_START_FAILED";

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    service: "studio-balance-web",
    message: "oidc_operation_failed",
    requestId,
    environment: process.env.APP_ENV ?? "unknown",
    version: process.env.APP_VERSION ?? "unknown",
    errorCode,
    operation
  }));

  return requestId;
}

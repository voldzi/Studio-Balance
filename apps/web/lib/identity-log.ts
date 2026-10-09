import { randomUUID } from "node:crypto";

type IdentityOperation = "admin_login_start" | "client_login_start" | "password_change_start";

export function safeIdentityRequestId(value: string | null | undefined): string {
  return value && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : `req_${randomUUID()}`;
}

export function identityRequestId(request: Request): string {
  return safeIdentityRequestId(request.headers.get("x-request-id"));
}

type SessionCookieState = "missing" | "malformed" | "unrecognized" | "valid_without_admin_assurance";

export function sessionCookieState(cookie: string | undefined, resolved: boolean): SessionCookieState {
  if (!cookie) return "missing";
  if (!/^[A-Za-z0-9_-]{43}$/.test(cookie)) return "malformed";
  return resolved ? "valid_without_admin_assurance" : "unrecognized";
}

export function logAdminLoginRequired(requestId: string, input: {
  adminCookie: SessionCookieState; webCookie: SessionCookieState; rememberDeviceRequested: boolean;
}): void {
  logSessionDiagnostic("admin_interactive_login_required", requestId, {
    mode: "admin", adminCookie: input.adminCookie, webCookie: input.webCookie,
    rememberDeviceRequested: input.rememberDeviceRequested
  });
}

export function logSessionCookieIssued(requestId: string, mode: "web" | "admin", remembered: boolean): void {
  logSessionDiagnostic("application_session_cookie_issued", requestId, {
    mode, persistence: remembered ? "remembered_90_days" : "browser_session"
  });
}

export function logSessionCookieCleared(requestId: string, mode: "web" | "admin", reason: "explicit_logout" | "callback_failed"): void {
  logSessionDiagnostic("application_session_cookie_cleared", requestId, { mode, reason });
}

function logSessionDiagnostic(message: string, requestId: string, fields: Record<string, string | boolean>): void {
  // Only fixed event names and typed metadata enter this helper, never request
  // bodies, cookie values, provider errors or account identifiers.
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: "info", service: "studio-balance-web",
    message, requestId: safeIdentityRequestId(requestId), environment: process.env.APP_ENV ?? "unknown",
    version: process.env.APP_VERSION ?? "unknown", ...fields
  }));
}

export function logIdentityFailure(request: Request, operation: IdentityOperation, error: unknown, requestId = identityRequestId(request)): string {
  requestId = safeIdentityRequestId(requestId);
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

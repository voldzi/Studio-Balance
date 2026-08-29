import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { adminIdentityCookies, createWebSession, finishLogin, identityConfig, isSecureCookie, publicRedirectUrl, rememberedDeviceMaxAgeSeconds } from "../../../../lib/identity";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    logAdminLoginFailure(request, { errorCode: "ADMIN_OIDC_CODE_MISSING", stage: "authorization_response" });
    const response = NextResponse.redirect(publicRedirectUrl("/admin/prihlaseni?error=callback", "admin"));
    response.cookies.delete(adminIdentityCookies.attempt);
    return response;
  }
  try {
    const result = await finishLogin({ code, state: request.nextUrl.searchParams.get("state"), cookieValue: request.cookies.get(adminIdentityCookies.attempt)?.value }, "admin");
    if (!result.roles.some((role) => role === "admin" || role === "super_admin")) throw new Error("Admin role is required");
    if (!result.session.mfaVerified) throw new Error("Admin MFA is required");
    const response = NextResponse.redirect(publicRedirectUrl(result.returnTo, "admin"));
    const sessionToken = await createWebSession(result, "admin");
    response.cookies.set(adminIdentityCookies.session, sessionToken, { httpOnly: true, ...(result.rememberDevice ? { maxAge: rememberedDeviceMaxAgeSeconds } : {}), path: "/", sameSite: "lax", secure: isSecureCookie(identityConfig("admin")) });
    response.cookies.delete(adminIdentityCookies.attempt);
    return response;
  } catch (error) {
    const roleMissing = error instanceof Error && error.message === "Admin role is required";
    const mfaMissing = error instanceof Error && error.message === "Admin MFA is required";
    logAdminLoginFailure(request, roleMissing
      ? { errorCode: "ADMIN_ROLE_REQUIRED", stage: "authorization" }
      : mfaMissing
        ? { errorCode: "ADMIN_MFA_REQUIRED", stage: "authorization" }
      : classifyCallbackFailure(error));
    const response = NextResponse.redirect(publicRedirectUrl(`/admin/prihlaseni?error=${roleMissing ? "role" : mfaMissing ? "mfa" : "callback"}`, "admin"));
    response.cookies.delete(adminIdentityCookies.attempt);
    return response;
  }
}

type AdminLoginFailure = {
  errorCode:
    | "ADMIN_OIDC_CODE_MISSING"
    | "ADMIN_OIDC_STATE_INVALID"
    | "ADMIN_OIDC_DISCOVERY_FAILED"
    | "ADMIN_OIDC_TOKEN_EXCHANGE_FAILED"
    | "ADMIN_OIDC_CLAIMS_INVALID"
    | "ADMIN_ROLE_REQUIRED"
    | "ADMIN_MFA_REQUIRED"
    | "ADMIN_OIDC_CALLBACK_FAILED";
  stage: "authorization_response" | "state" | "discovery" | "token_exchange" | "claims" | "authorization" | "callback";
};

function classifyCallbackFailure(error: unknown): AdminLoginFailure {
  if (!(error instanceof Error)) return { errorCode: "ADMIN_OIDC_CALLBACK_FAILED", stage: "callback" };
  switch (error.message) {
    case "Invalid OIDC login state":
      return { errorCode: "ADMIN_OIDC_STATE_INVALID", stage: "state" };
    case "OIDC discovery failed":
    case "OIDC discovery document is invalid":
      return { errorCode: "ADMIN_OIDC_DISCOVERY_FAILED", stage: "discovery" };
    case "OIDC token exchange failed":
      return { errorCode: "ADMIN_OIDC_TOKEN_EXCHANGE_FAILED", stage: "token_exchange" };
    case "OIDC response did not contain identity and refresh tokens":
    case "OIDC identity claims are incomplete":
      return { errorCode: "ADMIN_OIDC_CLAIMS_INVALID", stage: "claims" };
    default:
      return { errorCode: "ADMIN_OIDC_CALLBACK_FAILED", stage: "callback" };
  }
}

function logAdminLoginFailure(request: NextRequest, failure: AdminLoginFailure): void {
  const incomingRequestId = request.headers.get("x-request-id");
  const requestId = incomingRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID();
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    service: "studio-balance-web",
    message: "admin_oidc_login_failed",
    requestId,
    environment: process.env.APP_ENV ?? "unknown",
    version: process.env.APP_VERSION ?? "unknown",
    errorCode: failure.errorCode,
    stage: failure.stage
  }));
}

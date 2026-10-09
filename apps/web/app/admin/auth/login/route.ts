import { NextRequest, NextResponse } from "next/server";

import { adminIdentityCookies, createLoginAttempt, identityConfig, identityCookies, isMfaAdministrator, isSecureCookie, publicRedirectUrl, readWebSession, safeReturnTo } from "../../../../lib/identity";
import { identityRequestId, logAdminLoginRequired, logIdentityFailure, sessionCookieState } from "../../../../lib/identity-log";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo") ?? "/admin");
  const rememberDevice = request.nextUrl.searchParams.get("rememberDevice") === "1";
  const correlationId = identityRequestId(request);
  const webCookie = request.cookies.get(identityCookies.session)?.value;
  const adminCookie = request.cookies.get(adminIdentityCookies.session)?.value;
  let loginAttempt: Awaited<ReturnType<typeof createLoginAttempt>>;
  try {
    const [web, admin] = await Promise.allSettled([
      readWebSession(webCookie, "web", { rejectUnavailable: true, requestId: correlationId }),
      readWebSession(adminCookie, "admin", { rejectUnavailable: true, requestId: correlationId })
    ]);
    const webSession = web.status === "fulfilled" ? web.value : undefined;
    const adminSession = admin.status === "fulfilled" ? admin.value : undefined;
    if (isMfaAdministrator(webSession) || isMfaAdministrator(adminSession)) return NextResponse.redirect(publicRedirectUrl(returnTo, "admin"));
    if (web.status === "rejected") throw web.reason;
    if (admin.status === "rejected") throw admin.reason;
    logAdminLoginRequired(correlationId, {
      webCookie: sessionCookieState(webCookie, Boolean(webSession)),
      adminCookie: sessionCookieState(adminCookie, Boolean(adminSession)),
      rememberDeviceRequested: rememberDevice
    });
    const loginHint = webSession?.roles.some((role) => role === "admin" || role === "super_admin") ? webSession.email : undefined;
    loginAttempt = await createLoginAttempt(returnTo, "admin", loginHint, rememberDevice);
  } catch (error) {
    const requestId = logIdentityFailure(request, "admin_login_start", error, correlationId);
    const params = new URLSearchParams({ error: "unavailable", requestId });
    return NextResponse.redirect(publicRedirectUrl(`/admin/prihlaseni?${params.toString()}`, "admin"));
  }
  const { authorizationUrl, cookieValue } = loginAttempt;
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(adminIdentityCookies.attempt, cookieValue, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax", secure: isSecureCookie(identityConfig("admin")) });
  return response;
}

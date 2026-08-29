import { NextRequest, NextResponse } from "next/server";

import { adminIdentityCookies, createLoginAttempt, identityConfig, identityCookies, isSecureCookie, readWebSession, safeReturnTo } from "../../../../lib/identity";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo") ?? "/admin");
  const webSession = await readWebSession(request.cookies.get(identityCookies.session)?.value);
  const loginHint = webSession?.roles.some((role) => role === "admin" || role === "super_admin") ? webSession.email : undefined;
  const rememberDevice = request.nextUrl.searchParams.get("rememberDevice") === "1";
  const { authorizationUrl, cookieValue } = await createLoginAttempt(returnTo, "admin", loginHint, rememberDevice);
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(adminIdentityCookies.attempt, cookieValue, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax", secure: isSecureCookie(identityConfig("admin")) });
  return response;
}

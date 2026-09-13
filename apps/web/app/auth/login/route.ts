import { NextRequest, NextResponse } from "next/server";

import { createLoginAttempt, identityConfig, identityCookies, isSecureCookie, publicRedirectUrl, safeReturnTo } from "../../../lib/identity";
import { logIdentityFailure } from "../../../lib/identity-log";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const rememberDevice = request.nextUrl.searchParams.get("rememberDevice") === "1";
  let loginAttempt: Awaited<ReturnType<typeof createLoginAttempt>>;
  try {
    loginAttempt = await createLoginAttempt(returnTo, "web", undefined, rememberDevice);
  } catch (error) {
    const requestId = logIdentityFailure(request, "client_login_start", error);
    const params = new URLSearchParams({ error: "unavailable", requestId, returnTo });
    return NextResponse.redirect(publicRedirectUrl(`/prihlaseni?${params.toString()}`));
  }
  const { authorizationUrl, cookieValue } = loginAttempt;
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(identityCookies.attempt, cookieValue, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: isSecureCookie(identityConfig())
  });
  return response;
}

import { NextRequest, NextResponse } from "next/server";

import { createLoginAttempt, identityConfig, identityCookies, isSecureCookie, safeReturnTo } from "../../../lib/identity";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rememberDevice = request.nextUrl.searchParams.get("rememberDevice") === "1";
  const { authorizationUrl, cookieValue } = await createLoginAttempt(safeReturnTo(request.nextUrl.searchParams.get("returnTo")), "web", undefined, rememberDevice);
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

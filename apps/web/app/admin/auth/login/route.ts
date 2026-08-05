import { NextRequest, NextResponse } from "next/server";

import { adminIdentityCookies, createLoginAttempt, identityConfig, isSecureCookie, safeReturnTo } from "../../../../lib/identity";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo") ?? "/admin");
  const { authorizationUrl, cookieValue } = await createLoginAttempt(returnTo, "admin");
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(adminIdentityCookies.attempt, cookieValue, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax", secure: isSecureCookie(identityConfig("admin")) });
  return response;
}

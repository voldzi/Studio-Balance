import { NextRequest, NextResponse } from "next/server";

import { finishLogin, identityConfig, identityCookies, isSecureCookie } from "../../../lib/identity";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/prihlaseni?error=callback", request.url));

  try {
    const result = await finishLogin({
      code,
      state: request.nextUrl.searchParams.get("state"),
      cookieValue: request.cookies.get(identityCookies.attempt)?.value
    });
    const response = NextResponse.redirect(new URL(result.returnTo, request.url));
    response.cookies.set(identityCookies.session, result.session, {
      httpOnly: true,
      maxAge: 8 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: isSecureCookie(identityConfig())
    });
    response.cookies.delete(identityCookies.attempt);
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/prihlaseni?error=callback", request.url));
    response.cookies.delete(identityCookies.attempt);
    return response;
  }
}

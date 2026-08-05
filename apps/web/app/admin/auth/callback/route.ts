import { NextRequest, NextResponse } from "next/server";

import { adminIdentityCookies, finishLogin, identityConfig, isSecureCookie } from "../../../../lib/identity";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/admin/prihlaseni?error=callback", request.url));
  try {
    const result = await finishLogin({ code, state: request.nextUrl.searchParams.get("state"), cookieValue: request.cookies.get(adminIdentityCookies.attempt)?.value }, "admin");
    if (!result.roles.some((role) => role === "admin" || role === "super_admin")) throw new Error("Admin role is required");
    const response = NextResponse.redirect(new URL(result.returnTo, request.url));
    response.cookies.set(adminIdentityCookies.session, result.session, { httpOnly: true, maxAge: 8 * 60 * 60, path: "/", sameSite: "lax", secure: isSecureCookie(identityConfig("admin")) });
    response.cookies.delete(adminIdentityCookies.attempt);
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/admin/prihlaseni?error=callback", request.url));
    response.cookies.delete(adminIdentityCookies.attempt);
    return response;
  }
}

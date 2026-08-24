import { NextRequest, NextResponse } from "next/server";

import {
  createLoginAttempt,
  identityConfig,
  identityCookies,
  isSecureCookie,
  publicRedirectUrl,
  readWebSession
} from "../../../lib/identity";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await readWebSession(request.cookies.get(identityCookies.session)?.value);
  if (!session) {
    const params = new URLSearchParams({ returnTo: "/muj-ucet?view=profile" });
    return NextResponse.redirect(publicRedirectUrl(`/prihlaseni?${params.toString()}`));
  }

  const { authorizationUrl, cookieValue } = await createLoginAttempt(
    "/muj-ucet?view=profile&security=password-updated",
    "web",
    session.email,
    true,
    "UPDATE_PASSWORD"
  );
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

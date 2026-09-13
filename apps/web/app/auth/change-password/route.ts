import { NextRequest, NextResponse } from "next/server";

import {
  createLoginAttempt,
  identityConfig,
  identityCookies,
  isSecureCookie,
  publicRedirectUrl,
  readWebSession
} from "../../../lib/identity";
import { logIdentityFailure } from "../../../lib/identity-log";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await readWebSession(request.cookies.get(identityCookies.session)?.value);
  if (!session) {
    const params = new URLSearchParams({ returnTo: "/muj-ucet?view=profile" });
    return NextResponse.redirect(publicRedirectUrl(`/prihlaseni?${params.toString()}`));
  }

  let loginAttempt: Awaited<ReturnType<typeof createLoginAttempt>>;
  try {
    loginAttempt = await createLoginAttempt(
      "/muj-ucet?view=profile&security=password-updated",
      "web",
      session.email,
      true,
      "UPDATE_PASSWORD"
    );
  } catch (error) {
    const requestId = logIdentityFailure(request, "password_change_start", error);
    const params = new URLSearchParams({ requestId, security: "unavailable", view: "profile" });
    return NextResponse.redirect(publicRedirectUrl(`/muj-ucet?${params.toString()}`));
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

import { NextRequest, NextResponse } from "next/server";

import { adminIdentityCookies, identityConfig, identityCookies, revokeWebSession } from "../../../lib/identity";
import { identityRequestId, logSessionCookieCleared } from "../../../lib/identity-log";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const publicAppUrl = identityConfig().publicAppUrl;
  if (origin && origin !== new URL(publicAppUrl).origin) return new NextResponse(null, { status: 403 });
  const requestId = identityRequestId(request);
  await Promise.allSettled([
    revokeWebSession(request.cookies.get(identityCookies.session)?.value, "web", requestId),
    revokeWebSession(request.cookies.get(adminIdentityCookies.session)?.value, "admin", requestId)
  ]);

  const response = NextResponse.redirect(new URL("/", publicAppUrl), { status: 303 });
  response.cookies.delete(identityCookies.session);
  response.cookies.delete(adminIdentityCookies.session);
  if (request.cookies.has(identityCookies.session)) logSessionCookieCleared(requestId, "web", "explicit_logout");
  if (request.cookies.has(adminIdentityCookies.session)) logSessionCookieCleared(requestId, "admin", "explicit_logout");
  return response;
}

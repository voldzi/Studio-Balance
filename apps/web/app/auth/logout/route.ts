import { NextRequest, NextResponse } from "next/server";

import { adminIdentityCookies, identityConfig, identityCookies, revokeWebSession } from "../../../lib/identity";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const publicAppUrl = identityConfig().publicAppUrl;
  if (origin && origin !== new URL(publicAppUrl).origin) return new NextResponse(null, { status: 403 });
  await Promise.allSettled([
    revokeWebSession(request.cookies.get(identityCookies.session)?.value, "web"),
    revokeWebSession(request.cookies.get(adminIdentityCookies.session)?.value, "admin")
  ]);

  const response = NextResponse.redirect(new URL("/", publicAppUrl), { status: 303 });
  response.cookies.delete(identityCookies.session);
  response.cookies.delete(adminIdentityCookies.session);
  return response;
}

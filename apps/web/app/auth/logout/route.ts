import { NextRequest, NextResponse } from "next/server";

import { identityConfig, identityCookies } from "../../../lib/identity";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const publicAppUrl = identityConfig().publicAppUrl;
  if (origin && origin !== new URL(publicAppUrl).origin) return new NextResponse(null, { status: 403 });

  const response = NextResponse.redirect(new URL("/", publicAppUrl), { status: 303 });
  response.cookies.delete(identityCookies.session);
  return response;
}

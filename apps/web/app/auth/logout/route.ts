import { NextRequest, NextResponse } from "next/server";

import { identityCookies } from "../../../lib/identity";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });

  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.delete(identityCookies.session);
  return response;
}

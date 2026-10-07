import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { contentSecurityPolicy } from "./lib/content-security-policy";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/api/internal" || path.startsWith("/api/internal/")) {
    return NextResponse.json({ code: "RESOURCE_NOT_FOUND", message: "Stránka nebyla nalezena.", requestId: crypto.randomUUID() },
      { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (path.startsWith("/api/")) return NextResponse.next();

  const nonce = randomBytes(16).toString("base64");
  const identityIssuer = process.env.OIDC_ISSUER_URL ?? (process.env.APP_ENV === "production" ? undefined : "http://localhost:8081/realms/studio-balance");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development", identityIssuer);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|vcode-analytics|sw.js|manifest.webmanifest|icon|apple-icon|robots.txt|sitemap.xml).*)"]
};

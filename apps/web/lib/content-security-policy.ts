export function contentSecurityPolicy(nonce: string, development = false, identityIssuer?: string): string {
  let identityOrigin = "";
  if (identityIssuer) {
    const issuer = new URL(identityIssuer);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(issuer.hostname);
    if (issuer.username || issuer.password || (issuer.protocol !== "https:" && !(issuer.protocol === "http:" && local))) {
      throw new Error("Invalid identity origin for form navigation");
    }
    identityOrigin = ` ${issuer.origin}`;
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // React uses style attributes for layout; this does not permit inline scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    // Browsers apply form-action to login form redirects as well. Permit only
    // the configured identity origin, never a request-supplied return address.
    `form-action 'self'${identityOrigin}`,
    "frame-ancestors 'none'"
  ].join("; ");
}

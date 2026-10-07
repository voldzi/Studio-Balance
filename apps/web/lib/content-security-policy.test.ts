import { NextRequest } from "next/server";
import * as nextTesting from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../proxy";
import { contentSecurityPolicy } from "./content-security-policy";
import { analyticsPermitted, createPublicAnalyticsBridge } from "./public-analytics";
import { selectPublicAnalyticsPlan } from "./public-analytics-v2";

// Next retains the middleware matcher helper on versions using the proxy name.
// Use the framework's actual route matcher, including its URL normalization.
const helpers = nextTesting as unknown as {
  unstable_doesProxyMatch?: (input: { config: typeof config; url: string }) => boolean;
  unstable_doesMiddlewareMatch?: (input: { config: typeof config; url: string }) => boolean;
};
const matches = helpers.unstable_doesProxyMatch ?? helpers.unstable_doesMiddlewareMatch;
if (!matches) throw new Error("Next route matcher testing helper is unavailable");

const request = (path: string, headers?: HeadersInit) => new NextRequest(`https://studio-balance.cz${path}`, headers ? { headers } : undefined);
afterEach(() => { vi.unstubAllEnvs(); });

describe("CSP and request nonce boundary", () => {
  it("uses a distinct nonce per response and replaces forged request security headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    const first = proxy(request("/admin/prihlaseni", { "x-nonce": "attacker-controlled", "Content-Security-Policy": "script-src * 'unsafe-inline'", Cookie: "studio_admin_session=opaque-test-session" }));
    const second = proxy(request("/admin/prihlaseni"));
    const nonce = first.headers.get("x-middleware-request-x-nonce")!;
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonce).not.toBe(second.headers.get("x-middleware-request-x-nonce"));
    expect(nonce).not.toBe("attacker-controlled");
    const policy = first.headers.get("Content-Security-Policy")!;
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(policy).not.toContain("attacker-controlled");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("script-src *");
    expect(first.headers.get("x-middleware-request-cookie")).toBe("studio_admin_session=opaque-test-session");
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    expect(first.headers.get("X-Frame-Options")).toBe("DENY");
    expect(first.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(first.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(first.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=()");
  });

  it("permits development tooling only in the development policy", () => {
    const production = contentSecurityPolicy("trusted-test-nonce");
    const development = contentSecurityPolicy("trusted-test-nonce", true);
    expect(production).toContain("object-src 'none'");
    expect(production).toContain("frame-ancestors 'none'");
    expect(production).toContain("form-action 'self'");
    expect(production).toContain("connect-src 'self'");
    expect(production.split("; ").find(value => value.startsWith("script-src"))).not.toContain("unsafe-inline");
    expect(production).not.toContain("unsafe-eval");
    expect(production).not.toContain("ws:");
    expect(development).toContain("'unsafe-eval'");
    expect(development).toContain("connect-src 'self' ws: wss:");
  });

  it.each(["/api/internal", "/api/internal/auth/sessions", "/api/internal/auth/sessions?returnTo=%2Fadmin"])("blocks internal API forwarding for %s", async path => {
    const response = proxy(request(path));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.has("x-middleware-next")).toBe(false);
    expect(await response.json()).toMatchObject({ code: "RESOURCE_NOT_FOUND", requestId: expect.any(String) });
  });

  it("permits the configured identity form redirect without broadening fetch or scripts", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("OIDC_ISSUER_URL", "https://login.studio-balance.cz/realms/studio-balance");
    const policy = proxy(request("/admin/prihlaseni?returnTo=https://attacker.example", { "x-forwarded-host": "attacker.example" })).headers.get("Content-Security-Policy")!;
    expect(policy).toContain("form-action 'self' https://login.studio-balance.cz");
    expect(policy).toContain("connect-src 'self';");
    expect(policy).not.toContain("attacker.example");
    expect(policy).not.toContain("form-action *");
    expect(contentSecurityPolicy("nonce", false, "http://localhost:8081/realms/studio-balance")).toContain("form-action 'self' http://localhost:8081");
  });

  it.each(["javascript:alert(1)", "http://identity.example/realm", "https://user:password@identity.example/realm"])("rejects unsafe configured identity origin %s", issuer => {
    expect(() => contentSecurityPolicy("nonce", false, issuer)).toThrow("Invalid identity origin");
  });

  it("continues normal JSON API routing without issuing an HTML nonce policy", () => {
    const response = proxy(request("/api/v1/sessions"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull();
  });
});

describe("proxy route coverage and unchanged analytics privacy", () => {
  it.each(["/", "/admin", "/admin/prihlaseni", "/muj-ucet", "/rozvrh", "/lekce/barre", "/auth/login", "/api/internal", "/api/internal/auth/sessions"])("protects application route %s", path => {
    expect(matches!({ config, url: `https://studio-balance.cz${path}` })).toBe(true);
  });

  it.each(["/_next/static/chunks/app.js", "/_next/image?url=%2Fimages%2Fphoto.webp&w=64&q=75", "/images/photo.webp", "/vcode-analytics-tiktok.js", "/sw.js", "/manifest.webmanifest", "/icon.svg", "/apple-icon.png", "/favicon.ico", "/robots.txt", "/sitemap.xml"])("keeps static asset %s outside nonce processing", path => {
    expect(matches!({ config, url: `https://studio-balance.cz${path}` })).toBe(false);
  });

  it("retains approval/SRI and suppresses private, DNT, GPC and offline analytics under the CSP", () => {
    const plan = selectPublicAnalyticsPlan();
    expect(plan.enabled).toBe(true);
    expect(plan.privacyNoticeApproved).toBe(true);
    expect(plan.runtimeIntegrity).toBe("sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5");
    const send = vi.fn();
    const bridge = createPublicAnalyticsBridge(send);
    const anonymous = { eligible: true, online: true, doNotTrack: null, globalPrivacyControl: false };
    for (const override of [{ eligible: false }, { online: false }, { doNotTrack: "1" }, { globalPrivacyControl: true }]) {
      const environment = { ...anonymous, ...override };
      expect(analyticsPermitted(environment)).toBe(false);
      bridge("/rozvrh", environment);
    }
    bridge("/admin", anonymous);
    bridge("/muj-ucet", anonymous);
    expect(send).not.toHaveBeenCalled();
  });
});

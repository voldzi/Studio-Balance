import { createHash, createHmac } from "node:crypto";
import { decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLoginAttempt, createWebSession, isMfaAdministrator, publicRedirectUrl, rememberedDeviceMaxAgeSeconds, safeReturnTo, sessionFromClaims } from "./identity";

const originalPublicAppUrl = process.env.PUBLIC_APP_URL;
const originalIssuer = process.env.OIDC_ISSUER_URL;
const originalBackchannelIssuer = process.env.OIDC_BACKCHANNEL_ISSUER_URL;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
  if (originalIssuer === undefined) delete process.env.OIDC_ISSUER_URL;
  else process.env.OIDC_ISSUER_URL = originalIssuer;
  if (originalBackchannelIssuer === undefined) delete process.env.OIDC_BACKCHANNEL_ISSUER_URL;
  else process.env.OIDC_BACKCHANNEL_ISSUER_URL = originalBackchannelIssuer;
});

describe("publicRedirectUrl", () => {
  it("caps a trusted device at ninety days", () => {
    expect(rememberedDeviceMaxAgeSeconds).toBe(90 * 24 * 60 * 60);
  });

  it("always returns to the configured public origin behind a reverse proxy", () => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    expect(publicRedirectUrl("/rezervace/session-id").toString()).toBe("https://studio-balance.cz/rezervace/session-id");
  });

  it("uses the same public origin for the separate admin callback", () => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    expect(publicRedirectUrl("/admin", "admin").toString()).toBe("https://studio-balance.cz/admin");
  });

  it.each(["/\\attacker.example", "//attacker.example", "https://attacker.example", "/\n/attacker.example", "/\t/attacker.example", "/path\u0000"])("rejects unsafe return destination %j", (path) => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    expect(safeReturnTo(path)).toBe("/muj-ucet");
    expect(publicRedirectUrl(path).toString()).toBe("https://studio-balance.cz/muj-ucet");
  });

  it("normalizes internal destinations while preserving a booking query", () => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    expect(safeReturnTo("/unused/../rezervace/id?view=confirm#terms")).toBe("/rezervace/id?view=confirm#terms");
  });

  it("signs the exact internal request body with a fresh nonce and a deadline", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "a".repeat(43) }) });
    vi.stubGlobal("fetch", fetchMock);
    const login = { refreshToken: "synthetic-refresh-token", rememberDevice: false, returnTo: "/muj-ucet", roles: ["client"] as const,
      session: { subject: "synthetic", email: "client@example.test", emailVerified: false, mfaVerified: false, roles: ["client"] as ("client" | "admin" | "super_admin")[] } };
    await createWebSession({ ...login, roles: [...login.roles] }, "web");
    await createWebSession({ ...login, roles: [...login.roles] }, "web");
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const first = calls[0]![1];
    const second = calls[1]![1];
    const signed = first.headers as Record<string, string>;
    expect(signed["x-studiobalance-internal-nonce"]).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((second.headers as Record<string, string>)["x-studiobalance-internal-nonce"]).not.toBe(signed["x-studiobalance-internal-nonce"]);
    const bodyHash = createHash("sha256").update(String(first.body)).digest("hex");
    expect(signed["x-studiobalance-internal-signature"]).toBe(createHmac("sha256", process.env.SESSION_SECRET ?? "local-development-session-secret-change-before-sharing")
      .update(`${signed["x-studiobalance-internal-timestamp"]}:${signed["x-studiobalance-internal-nonce"]}:POST:/api/internal/sessions:${bodyHash}`).digest("base64url"));
    expect(first.signal).toBeInstanceOf(AbortSignal);
  });

  it("forces fresh Keycloak authentication for the protected admin client", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/auth",
        issuer: "http://localhost:8081/realms/studio-balance",
        jwks_uri: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/certs",
        token_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/token"
      })
    }));

    const result = await createLoginAttempt("/admin", "admin", "admin@example.test");
    const authorizationUrl = new URL(result.authorizationUrl);

    expect(authorizationUrl.searchParams.get("prompt")).toBe("login");
    expect(authorizationUrl.searchParams.get("max_age")).toBe("0");
    expect(authorizationUrl.searchParams.get("login_hint")).toBe("admin@example.test");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("does not send an unreasonably long login hint to Keycloak", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/auth",
        issuer: "http://localhost:8081/realms/studio-balance",
        jwks_uri: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/certs",
        token_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/token"
      })
    }));
    const result = await createLoginAttempt("/admin", "admin", "a".repeat(255));
    expect(new URL(result.authorizationUrl).searchParams.has("login_hint")).toBe(false);
  });

  it("stores the explicit trusted-device choice only in the signed short-lived login attempt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/auth",
        issuer: "http://localhost:8081/realms/studio-balance",
        jwks_uri: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/certs",
        token_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/token"
      })
    }));
    const result = await createLoginAttempt("/muj-ucet", "web", undefined, true);
    expect(decodeJwt(result.cookieValue).rememberDevice).toBe(true);
  });

  it("keeps the ordinary client login separate from the privileged fresh-login policy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/auth",
        issuer: "http://localhost:8081/realms/studio-balance",
        jwks_uri: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/certs",
        token_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/token"
      })
    }));

    const result = await createLoginAttempt("/muj-ucet", "web");
    const authorizationUrl = new URL(result.authorizationUrl);

    expect(authorizationUrl.searchParams.get("client_id")).toBe("studiobalance-web");
    expect(authorizationUrl.searchParams.has("prompt")).toBe(false);
    expect(authorizationUrl.searchParams.has("max_age")).toBe(false);
  });

  it("uses a signed PKCE action request for a self-service password change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/auth",
        issuer: "http://localhost:8081/realms/studio-balance",
        jwks_uri: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/certs",
        token_endpoint: "http://localhost:8081/realms/studio-balance/protocol/openid-connect/token"
      })
    }));

    const result = await createLoginAttempt("/muj-ucet?view=profile", "web", "client@example.test", true, "UPDATE_PASSWORD");
    const authorizationUrl = new URL(result.authorizationUrl);

    expect(authorizationUrl.searchParams.get("kc_action")).toBe("UPDATE_PASSWORD");
    expect(authorizationUrl.searchParams.get("login_hint")).toBe("client@example.test");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.has("prompt")).toBe(false);
  });

  it("accepts Keycloak dynamic backchannel endpoints while preserving the public authorization URL", async () => {
    process.env.OIDC_ISSUER_URL = "https://login.studio-balance.cz/realms/studio-balance";
    process.env.OIDC_BACKCHANNEL_ISSUER_URL = "http://keycloak:8081/realms/studio-balance";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://login.studio-balance.cz/realms/studio-balance/protocol/openid-connect/auth",
        issuer: "https://login.studio-balance.cz/realms/studio-balance",
        jwks_uri: "http://keycloak:8081/realms/studio-balance/protocol/openid-connect/certs",
        token_endpoint: "http://keycloak:8081/realms/studio-balance/protocol/openid-connect/token"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createLoginAttempt("/muj-ucet");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://keycloak:8081/realms/studio-balance/.well-known/openid-configuration",
      expect.objectContaining({
        headers: {
          host: "login.studio-balance.cz",
          "x-forwarded-host": "login.studio-balance.cz",
          "x-forwarded-proto": "https"
        }
      })
    );
    expect(new URL(result.authorizationUrl).origin).toBe("https://login.studio-balance.cz");
  });

  it("rejects token endpoints outside both the public issuer and configured backchannel", async () => {
    process.env.OIDC_ISSUER_URL = "https://login.studio-balance.cz/realms/studio-balance";
    process.env.OIDC_BACKCHANNEL_ISSUER_URL = "http://keycloak:8081/realms/studio-balance";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://login.studio-balance.cz/realms/studio-balance/protocol/openid-connect/auth",
        issuer: "https://login.studio-balance.cz/realms/studio-balance",
        jwks_uri: "https://attacker.example/certs",
        token_endpoint: "http://keycloak:8081/realms/studio-balance/protocol/openid-connect/token"
      })
    }));

    await expect(createLoginAttempt("/muj-ucet")).rejects.toThrow("OIDC discovery endpoint is outside the configured issuer");
  });

  it.each(["authorization_endpoint", "token_endpoint", "jwks_uri"])("rejects an external discovery %s even without a configured backchannel", async (endpoint) => {
    process.env.OIDC_ISSUER_URL = "https://login.studio-balance.cz/realms/studio-balance";
    delete process.env.OIDC_BACKCHANNEL_ISSUER_URL;
    const discovery = {
      authorization_endpoint: "https://login.studio-balance.cz/realms/studio-balance/protocol/openid-connect/auth",
      issuer: "https://login.studio-balance.cz/realms/studio-balance",
      jwks_uri: "https://login.studio-balance.cz/realms/studio-balance/protocol/openid-connect/certs",
      token_endpoint: "https://login.studio-balance.cz/realms/studio-balance/protocol/openid-connect/token"
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...discovery, [endpoint]: "https://attacker.example/collect" }) }));
    await expect(createLoginAttempt("/muj-ucet")).rejects.toThrow("outside the configured issuer");
  });
});

describe("sessionFromClaims", () => {
  const baseClaims = {
    sub: "admin-subject",
    email: "admin@example.test",
    email_verified: true,
    realm_access: { roles: ["client", "admin"] }
  };

  it("records OTP from the signed AMR claim as administrator assurance", () => {
    expect(sessionFromClaims({ ...baseClaims, amr: ["pwd", "otp"] })?.mfaVerified).toBe(true);
  });

  it("does not infer MFA from the administrator role alone", () => {
    expect(sessionFromClaims({ ...baseClaims, amr: ["pwd"] })?.mfaVerified).toBe(false);
  });

  it("reuses only a session that already proves both an administrator role and MFA", () => {
    const verifiedAdmin = sessionFromClaims({ ...baseClaims, amr: ["pwd", "otp"] });
    const adminWithoutMfa = sessionFromClaims({ ...baseClaims, amr: ["pwd"] });
    const verifiedClient = sessionFromClaims({
      ...baseClaims,
      realm_access: { roles: ["client"] },
      amr: ["pwd", "otp"]
    });

    expect(isMfaAdministrator(verifiedAdmin)).toBe(true);
    expect(isMfaAdministrator(adminWithoutMfa)).toBe(false);
    expect(isMfaAdministrator(verifiedClient)).toBe(false);
  });
});

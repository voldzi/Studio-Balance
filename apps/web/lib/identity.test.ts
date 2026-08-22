import { decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLoginAttempt, publicRedirectUrl, rememberedDeviceMaxAgeSeconds } from "./identity";

const originalPublicAppUrl = process.env.PUBLIC_APP_URL;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
});

describe("publicRedirectUrl", () => {
  it("caps a trusted device at ninety days", () => {
    expect(rememberedDeviceMaxAgeSeconds).toBe(90 * 24 * 60 * 60);
  });

  it("always returns to the configured public origin behind a reverse proxy", () => {
    process.env.PUBLIC_APP_URL = "https://studiobalance.zeleznalady.cz";
    expect(publicRedirectUrl("/rezervace/session-id").toString()).toBe("https://studiobalance.zeleznalady.cz/rezervace/session-id");
  });

  it("uses the same public origin for the separate admin callback", () => {
    process.env.PUBLIC_APP_URL = "https://studiobalance.zeleznalady.cz";
    expect(publicRedirectUrl("/admin", "admin").toString()).toBe("https://studiobalance.zeleznalady.cz/admin");
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
});

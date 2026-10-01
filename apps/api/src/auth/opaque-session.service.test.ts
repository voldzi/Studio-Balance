import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../config/runtime-config.js";
import { OpaqueSessionService, SESSION_REVALIDATION_INTERVAL_MS } from "./opaque-session.service.js";

const config: RuntimeConfig = {
  apiPort: 3001,
  databaseUrl: "postgresql://unused",
  environment: "test",
  logLevel: "error",
  oidc: { issuer: "http://localhost:8081/realms/studio-balance", webClientId: "web", webClientSecret: "web-secret", adminClientId: "admin", adminClientSecret: "admin-secret" },
  sessionSecret: "test-session-secret-that-is-long-enough-to-be-safe",
  version: "test"
};
const identity = { subject: "subject-1", email: "client@example.test", emailVerified: false, mfaVerified: false, roles: ["client"] as ("client" | "admin" | "super_admin")[] };

describe("OpaqueSessionService", () => {
  it("persists only a hash in place of the browser token and encrypts the refresh token", async () => {
    const database = { query: vi.fn(async (_sql: string, _values: unknown[] = []) => {
      void _values;
      return { rows: [] };
    }) };
    const service = new OpaqueSessionService(database as never, { value: config } as never);
    const created = await service.create({ kind: "web", refreshToken: "refresh-token-secret-value", session: identity });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const parameters = database.query.mock.calls[0]?.[1] as unknown as unknown[];
    expect(parameters[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(parameters[0]).not.toBe(created.token);
    expect(parameters[9]).not.toBe("refresh-token-secret-value");
    expect(parameters[9]).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("revalidates a stale role snapshot before returning a session", async () => {
    const createdQueries: unknown[][] = [];
    const row = {
      oidc_subject: identity.subject,
      email: identity.email,
      email_verified: false,
      first_name: null,
      last_name: null,
      mfa_verified: false,
      roles: ["client"],
      refresh_token_ciphertext: "",
      absolute_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      idle_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      last_revalidated_at: new Date(Date.now() - SESSION_REVALIDATION_INTERVAL_MS - 1),
      revoked_at: null
    };
    const database = {
      query: vi.fn(async (_sql: string, _values: unknown[] = []) => {
        void _values;
        return { rows: [] };
      }),
      transaction: async (work: (client: { query: (sql: string, values: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => work({
        query: async (sql, values) => {
          createdQueries.push(values);
          if (sql.includes("FOR UPDATE")) return { rows: [row] };
          return { rows: [] };
        }
      })
    };
    const service = new OpaqueSessionService(database as never, { value: config } as never);
    const seed = await service.create({ kind: "web", refreshToken: "refresh-token-secret-value", session: identity });
    row.refresh_token_ciphertext = database.query.mock.calls[0]?.[1]?.[9] as unknown as string;
    vi.spyOn(service as unknown as { refresh: () => Promise<unknown> }, "refresh").mockResolvedValue({ subject: identity.subject, session: { ...identity, mfaVerified: true, roles: ["client", "admin"] }, refreshToken: "rotated-refresh-token" });

    const resolved = await service.resolveToken(seed.token, "web");

    expect(resolved?.roles).toEqual(["client", "admin"]);
    expect(resolved?.mfaVerified).toBe(false);
    expect(createdQueries.some((values) => values.includes("rotated-refresh-token"))).toBe(false);
    expect(createdQueries.some((values) => values.some((value) => Array.isArray(value) && value.includes("client") && value.includes("admin")))).toBe(true);
  });

  it("requires both an administrator role and OTP assurance for the fallback admin session", async () => {
    const database = { query: vi.fn() };
    const service = new OpaqueSessionService(database as never, { value: config } as never);

    await expect(service.create({ kind: "admin", refreshToken: "refresh-token-secret-value", session: { ...identity, roles: ["admin"] } })).rejects.toThrow("MFA assurance");
    expect(database.query).not.toHaveBeenCalled();
  });
});


describe("identity backchannel", () => {
  it("refreshes using the internal token and JWKS endpoints but rejects a different token issuer", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
    const issuer = "https://login.studio-balance.test/realms/studio-balance";
    let tokenIssuer = issuer;
    const paths: string[] = [];
    const server = createServer(async (request, response) => {
      paths.push(request.url!);
      response.setHeader("content-type", "application/json");
      if (request.url?.endsWith("/certs")) { response.end(JSON.stringify({ keys: [jwk] })); return; }
      if (request.url?.endsWith("/revoke")) { response.end("{}"); return; }
      const token = await new SignJWT({ email: identity.email, realm_access: { roles: ["admin"] } })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(tokenIssuer)
        .setAudience("admin").setSubject(identity.subject).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      response.end(JSON.stringify({ id_token: token, refresh_token: "rotated-test-token" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server unavailable");
    const service = new OpaqueSessionService({} as never, { value: { ...config, oidc: { ...config.oidc, issuer,
      backchannelIssuer: `http://127.0.0.1:${address.port}/realms/studio-balance` } } } as never);
    const internal = service as unknown as { refresh: (token: string, kind: "admin") => Promise<{subject: string} | undefined>;
      revokeAtIdentityProvider: (token: string, kind: "admin") => Promise<void> };
    try {
      expect((await internal.refresh("test-refresh", "admin"))?.subject).toBe(identity.subject);
      expect(paths).toContain("/realms/studio-balance/protocol/openid-connect/token");
      expect(paths).toContain("/realms/studio-balance/protocol/openid-connect/certs");
      tokenIssuer = "https://wrong-issuer.test/realms/studio-balance";
      expect(await internal.refresh("test-refresh", "admin")).toBeUndefined();
      await internal.revokeAtIdentityProvider("test-refresh", "admin");
      expect(paths).toContain("/realms/studio-balance/protocol/openid-connect/revoke");
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});

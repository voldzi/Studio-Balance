import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../config/runtime-config.js";
import { OpaqueSessionService, SESSION_REVALIDATION_INTERVAL_MS, SESSION_TOUCH_INTERVAL_MS } from "./opaque-session.service.js";
import type { StudioSession } from "./session.js";

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
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
      last_seen_at: new Date(),
      revoked_at: null
    };
    const database = {
      query: vi.fn(async (_sql: string, _values: unknown[] = []) => {
        void _values;
        return { rows: _sql.startsWith("SELECT") ? [row] : [] };
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

async function sessionHarness(kind: "web" | "admin" = "web", session: StudioSession = identity) {
  const row = {
    oidc_subject: session.subject, email: session.email, email_verified: session.emailVerified,
    first_name: null as string | null, last_name: null as string | null, mfa_verified: session.mfaVerified, roles: session.roles,
    refresh_token_ciphertext: null as string | null,
    absolute_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), idle_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    last_revalidated_at: new Date(), last_seen_at: new Date(), revoked_at: null as Date | null
  };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT")) return { rows: row.revoked_at ? [] : [{ ...row }] };
    if (sql.includes("INSERT INTO application_sessions")) row.refresh_token_ciphertext = values[9] as string;
    if (sql.includes("SET revoked_at")) { row.revoked_at = new Date(); row.refresh_token_ciphertext = null; }
    if (sql.includes("SET refresh_token_ciphertext")) row.refresh_token_ciphertext = values[2] as string;
    if (sql.includes("SET email")) {
      row.email = values[2] as string; row.roles = values[6] as StudioSession["roles"];
      row.refresh_token_ciphertext = values[7] as string; row.last_revalidated_at = values[8] as Date;
      row.last_seen_at = values[9] as Date; row.idle_expires_at = values[10] as Date;
    }
    if (sql.includes("SET last_seen_at")) {
      if (row.revoked_at) return { rows: [] };
      row.last_seen_at = values[2] as Date;
      row.idle_expires_at = new Date(Math.min(row.absolute_expires_at.getTime(), (values[3] as Date).getTime()));
      return { rows: [{ ...row }] };
    }
    return { rows: [] };
  });
  const database = { query, transaction: vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query })) };
  const service = new OpaqueSessionService(database as never, { value: config } as never);
  const created = await service.create({ kind, refreshToken: "synthetic-initial-refresh-token", session });
  query.mockClear();
  return { row, database, service, token: created.token };
}

describe("session revalidation and bounded writes", () => {
  it("reads fresh sessions without row locks, transactions or repeated writes", async () => {
    const { service, token, database } = await sessionHarness();
    expect(await service.resolveToken(token, "web")).toMatchObject(identity);
    expect(await service.resolveToken(token, "web")).toMatchObject(identity);
    expect(database.transaction).not.toHaveBeenCalled();
    expect(database.query.mock.calls.every(([sql]) => sql.startsWith("SELECT") && !sql.includes("FOR UPDATE"))).toBe(true);
  });

  it("touches at most once per interval and never extends past the absolute expiry", async () => {
    const { service, token, row, database } = await sessionHarness();
    row.last_seen_at = new Date(Date.now() - SESSION_TOUCH_INTERVAL_MS - 1);
    row.absolute_expires_at = new Date(Date.now() + 10 * 60 * 1000);
    row.idle_expires_at = new Date(Date.now() + 5 * 60 * 1000);
    expect(await service.resolveToken(token, "web")).toMatchObject(identity);
    expect(await service.resolveToken(token, "web")).toMatchObject(identity);
    expect(database.query.mock.calls.filter(([sql]) => sql.includes("SET last_seen_at"))).toHaveLength(1);
    expect(row.idle_expires_at.getTime()).toBe(row.absolute_expires_at.getTime());
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("fails closed on a temporary provider failure while retaining the session and rotated credential for retry", async () => {
    const { service, token, row } = await sessionHarness();
    row.last_revalidated_at = new Date(Date.now() - SESSION_REVALIDATION_INTERVAL_MS - 1);
    const lastVerified = row.last_revalidated_at;
    const previousCiphertext = row.refresh_token_ciphertext;
    const refresh = vi.spyOn(service as unknown as { refresh: () => Promise<unknown> }, "refresh")
      .mockResolvedValueOnce({ unavailable: true, refreshToken: "synthetic-rotated-refresh-token" })
      .mockResolvedValueOnce({ subject: identity.subject, session: { ...identity, roles: ["client", "admin"], mfaVerified: true } });
    await expect(service.resolveToken(token, "web")).rejects.toMatchObject({ status: 503, response: { code: "IDENTITY_PROVIDER_UNAVAILABLE" } });
    expect(row.revoked_at).toBeNull();
    expect(row.last_revalidated_at).toBe(lastVerified);
    expect(row.roles).toEqual(["client"]);
    expect(row.refresh_token_ciphertext).not.toBe(previousCiphertext);
    expect(row.refresh_token_ciphertext).not.toBe("synthetic-rotated-refresh-token");
    expect(await service.resolveToken(token, "web")).toMatchObject({ ...identity, roles: ["client", "admin"], mfaVerified: false });
    expect(refresh.mock.calls[1]).toEqual(["synthetic-rotated-refresh-token", "web"]);
  });

  it("coalesces concurrent refreshes and rotates the credential only once", async () => {
    const { service, token, row, database } = await sessionHarness();
    row.last_revalidated_at = new Date(Date.now() - SESSION_REVALIDATION_INTERVAL_MS - 1);
    let complete!: (result: unknown) => void;
    const refresh = vi.spyOn(service as unknown as { refresh: () => Promise<unknown> }, "refresh").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const resolutions = Array.from({ length: 8 }, () => service.resolveToken(token, "web"));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    complete({ subject: identity.subject, session: identity, refreshToken: "synthetic-once-rotated-refresh-token" });
    expect((await Promise.all(resolutions)).every((result) => result?.subject === identity.subject)).toBe(true);
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(database.query.mock.calls.filter(([sql]) => sql.includes("SET email"))).toHaveLength(1);
  });

  it.each(["invalid", "subject", "role"])("revokes an admin session after definite %s invalidation", async (reason) => {
    const admin = { ...identity, roles: ["admin"] as StudioSession["roles"], mfaVerified: true };
    const { service, token, row } = await sessionHarness("admin", admin);
    row.last_revalidated_at = new Date(Date.now() - SESSION_REVALIDATION_INTERVAL_MS - 1);
    vi.spyOn(service as unknown as { refresh: () => Promise<unknown> }, "refresh").mockResolvedValue(reason === "invalid" ? undefined : {
      subject: reason === "subject" ? "different-subject" : identity.subject,
      session: reason === "role" ? identity : admin
    });
    expect(await service.resolveToken(token, "admin")).toBeUndefined();
    expect(row.revoked_at).toBeInstanceOf(Date);
    expect(row.refresh_token_ciphertext).toBeNull();
  });

  it.each(["absolute_expires_at", "idle_expires_at"] as const)("keeps the exact %s boundary after a provider outage", async (field) => {
    const { service, token, row } = await sessionHarness();
    row[field] = new Date(Date.now() - 1);
    const refresh = vi.spyOn(service as unknown as { refresh: () => Promise<unknown> }, "refresh");
    expect(await service.resolveToken(token, "web")).toBeUndefined();
    expect(row.revoked_at).toBeInstanceOf(Date);
    expect(refresh).not.toHaveBeenCalled();
  });
});


describe("identity backchannel", () => {
  it("refreshes using the internal token and JWKS endpoints but rejects a different token issuer", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
    const issuer = "https://login.studio-balance.test/realms/studio-balance";
    let tokenIssuer = issuer;
    let tokenAudience = "admin";
    let signingKey = privateKey;
    const paths: string[] = [];
    const server = createServer(async (request, response) => {
      paths.push(request.url!);
      response.setHeader("content-type", "application/json");
      if (request.url?.endsWith("/certs")) { response.end(JSON.stringify({ keys: [jwk] })); return; }
      if (request.url?.endsWith("/revoke")) { response.end("{}"); return; }
      const token = await new SignJWT({ email: identity.email, realm_access: { roles: ["admin"] } })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(tokenIssuer)
        .setAudience(tokenAudience).setSubject(identity.subject).setIssuedAt().setExpirationTime("5m").sign(signingKey);
      response.end(JSON.stringify({ id_token: token, refresh_token: "rotated-test-token" }));
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
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
      tokenIssuer = issuer;
      tokenAudience = "different-client";
      expect(await internal.refresh("test-refresh", "admin")).toBeUndefined();
      tokenAudience = "admin";
      signingKey = (await generateKeyPair("RS256")).privateKey;
      expect(await internal.refresh("test-refresh", "admin")).toBeUndefined();
      expect(paths.filter((path) => path.endsWith("/certs"))).toHaveLength(1);
      await internal.revokeAtIdentityProvider("test-refresh", "admin");
      expect(paths).toContain("/realms/studio-balance/protocol/openid-connect/revoke");
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  }, 20_000);

  it("retains a rotated credential when the token endpoint succeeds but JWKS is temporarily unavailable", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const issuer = "https://login.studio-balance.test/realms/studio-balance";
    const token = await new SignJWT({ email: identity.email, realm_access: { roles: ["client"] } })
      .setProtectedHeader({ alg: "RS256", kid: "synthetic-key" }).setIssuer(issuer)
      .setAudience("web").setSubject(identity.subject).setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const paths: string[] = [];
    const server = createServer((request, response) => {
      paths.push(request.url!);
      if (request.url?.endsWith("/certs")) { response.writeHead(503); response.end("Synthetic JWKS outage"); return; }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ id_token: token, refresh_token: "synthetic-rotated-after-token-success" }));
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server unavailable");
    const service = new OpaqueSessionService({} as never, { value: { ...config, oidc: { ...config.oidc, issuer,
      backchannelIssuer: `http://127.0.0.1:${address.port}/realms/studio-balance` } } } as never);
    try {
      const internal = service as unknown as { refresh: (refreshToken: string, kind: "web") => Promise<unknown> };
      expect(await internal.refresh("synthetic-original-refresh", "web")).toEqual({ unavailable: true, refreshToken: "synthetic-rotated-after-token-success" });
      expect(paths).toEqual(["/realms/studio-balance/protocol/openid-connect/token", "/realms/studio-balance/protocol/openid-connect/certs"]);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  }, 20_000);

  it("distinguishes revoked refresh tokens from network and provider failures", async () => {
    const service = new OpaqueSessionService({} as never, { value: config } as never);
    const internal = service as unknown as { refresh: (token: string, kind: "web") => Promise<unknown> };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
    expect(await internal.refresh("synthetic-refresh", "web")).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Temporary provider outage", { status: 503 })));
    expect(await internal.refresh("synthetic-refresh", "web")).toEqual({ unavailable: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Synthetic timeout", "TimeoutError")));
    expect(await internal.refresh("synthetic-refresh", "web")).toEqual({ unavailable: true });
  });
});

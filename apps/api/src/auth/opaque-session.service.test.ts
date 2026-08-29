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

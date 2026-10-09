import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client, Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../config/runtime-config.js";
import type { DatabaseService } from "../database/database.service.js";
import { OpaqueSessionService } from "./opaque-session.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);
const identity = { subject: "synthetic-session-owner", email: "session-test@example.test", emailVerified: false, mfaVerified: false, roles: ["client"] as const };

describe.skipIf(!databaseUrl)("session diagnostics transactions (local PostgreSQL)", () => {
  let setup: Client; let pool: Pool; let schema: string;
  let database: DatabaseService; let config: RuntimeConfig; let service: OpaqueSessionService;
  let token: string; let legacyId: string; let failCommit = false;

  beforeEach(async () => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl!).hostname)) throw new Error("Session tests require an isolated local database.");
    setup = new Client({ connectionString: databaseUrl }); await setup.connect();
    schema = `studio_session_diagnostics_${randomUUID().replaceAll("-", "")}`;
    await setup.query(`CREATE SCHEMA "${schema}"`); await setup.query(`SET search_path TO "${schema}",public`);
    for (const file of ["0013_opaque_application_sessions.sql", "0014_application_session_mfa_assurance.sql"]) {
      await setup.query(await readFile(new URL(file, migrations), "utf8"));
    }
    legacyId = (await setup.query(`INSERT INTO application_sessions
      (token_hash,kind,oidc_subject,email,email_verified,roles,absolute_expires_at,idle_expires_at,last_revalidated_at,last_seen_at,revoked_at)
      VALUES (repeat('f',64),'admin','legacy-synthetic','legacy@example.test',false,'{admin}',now()+interval '90 days',
        now()+interval '30 days',now(),now(),now()) RETURNING id`)).rows[0].id;
    await setup.query(await readFile(new URL("0031_application_session_revocation_reason.sql", migrations), "utf8"));
    pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: schema, options: `-c search_path=${schema},public` });
    failCommit = false;
    database = { query: pool.query.bind(pool), transaction: async (work: Parameters<DatabaseService["transaction"]>[0]) => {
      const client = await pool.connect(); await client.query("BEGIN");
      try { const result = await work(client); if (failCommit) throw new Error("Synthetic transaction commit failure"); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    } } as unknown as DatabaseService;
    config = { apiPort: 3001, databaseUrl: databaseUrl!, environment: "test", logLevel: "info", version: "session-test",
      sessionSecret: "synthetic-session-test-secret-at-least-32-characters",
      oidc: { issuer: "http://127.0.0.1:8081/realms/studio-balance", webClientId: "web", webClientSecret: "synthetic-web", adminClientId: "admin", adminClientSecret: "synthetic-admin" } };
    service = new OpaqueSessionService(database, { value: config } as never);
    token = (await service.create({ kind: "web", refreshToken: "synthetic-private-refresh-token", session: { ...identity, roles: [...identity.roles] } })).token;
  });

  afterEach(async () => {
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    await pool?.end();
    if (setup) { if (schema) await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await setup.end(); }
  });

  async function currentRow() { return (await setup.query("SELECT * FROM application_sessions WHERE oidc_subject=$1", [identity.subject])).rows[0]; }

  it("keeps legacy reasons unknown and rejects arbitrary diagnostic text", async () => {
    expect((await setup.query("SELECT revoked_at,revoke_reason,revoke_detail,revoke_request_id FROM application_sessions WHERE id=$1", [legacyId])).rows[0])
      .toEqual({ revoked_at: expect.any(Date), revoke_reason: null, revoke_detail: null, revoke_request_id: null });
    await expect(setup.query("UPDATE application_sessions SET revoke_reason='provider says secret',revoke_request_id='req_test' WHERE id=$1", [legacyId])).rejects.toMatchObject({ code: "23514" });
    await expect(setup.query("UPDATE application_sessions SET revoke_reason='identity_token_invalid',revoke_detail='secret token contents',revoke_request_id='req_test' WHERE id=$1", [legacyId])).rejects.toMatchObject({ code: "23514" });
    await expect(setup.query("UPDATE application_sessions SET revoke_reason='explicit_logout',revoke_request_id='unsafe id' WHERE id=$1", [legacyId])).rejects.toMatchObject({ code: "23514" });
    expect((await currentRow()).revoke_reason).toBeNull();
  });

  it("serializes logout across service instances and preserves exactly one original reason", async () => {
    const second = new OpaqueSessionService(database, { value: config } as never);
    for (const instance of [service, second]) vi.spyOn(instance as unknown as { revokeAtIdentityProvider: () => Promise<void> }, "revokeAtIdentityProvider").mockResolvedValue();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? service : second).revokeToken(token, "web", `req_parallel_${index}`)));
    const first = await currentRow();
    await service.revokeToken(token, "web", "req_repeated");
    expect(await service.resolveToken(token, "web", "req_later_resolve")).toBeUndefined();
    const after = await currentRow();
    expect(after).toMatchObject({ revoke_reason: "explicit_logout", revoke_detail: null, revoke_request_id: first.revoke_request_id, revoked_at: first.revoked_at, refresh_token_ciphertext: null });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ sessionId: first.id, requestId: first.revoke_request_id, reason: "explicit_logout" });
  });

  it.each(["absolute", "idle"])("persists exact %s expiry without attempting provider verification", async (boundary) => {
    const row = await currentRow();
    if (boundary === "absolute") await setup.query("UPDATE application_sessions SET created_at=now()-interval '2 days',absolute_expires_at=now()-interval '1 minute',idle_expires_at=now()-interval '1 minute' WHERE id=$1", [row.id]);
    else await setup.query("UPDATE application_sessions SET idle_expires_at=now()-interval '1 minute' WHERE id=$1", [row.id]);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await service.resolveToken(token, "web", "req_expiry")).toBeUndefined();
    expect(await currentRow()).toMatchObject({ revoke_reason: `${boundary}_expired`, revoke_request_id: "req_expiry", refresh_token_ciphertext: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records a definitive provider rejection but retains sessions during provider outages", async () => {
    await setup.query("UPDATE application_sessions SET last_revalidated_at=now()-interval '20 minutes' WHERE oidc_subject=$1", [identity.subject]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Synthetic provider error", { status: 503 })));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(service.resolveToken(token, "web", "req_outage")).rejects.toMatchObject({ status: 503 });
    expect(await currentRow()).toMatchObject({ revoked_at: null, revoke_reason: null, revoke_request_id: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant", error_description: "Synthetic secret value that must not enter logs" }), { status: 400 })));
    expect(await service.resolveToken(token, "web", "req_rejected")).toBeUndefined();
    expect(await currentRow()).toMatchObject({ revoke_reason: "provider_invalid_grant", revoke_request_id: "req_rejected", refresh_token_ciphertext: null });
    expect(log.mock.calls.filter(([value]) => JSON.parse(String(value)).message === "application_session_revoked")).toHaveLength(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret value|synthetic-private-refresh-token|session-test@example/);
  });

  it("rolls back reason and credential removal without reporting a committed revocation", async () => {
    await setup.query("UPDATE application_sessions SET idle_expires_at=now()-interval '1 minute' WHERE oidc_subject=$1", [identity.subject]);
    const initial = await currentRow();
    failCommit = true;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(service.resolveToken(token, "web", "req_rollback")).rejects.toThrow("Synthetic transaction commit failure");
    expect(await currentRow()).toMatchObject({ revoked_at: null, revoke_reason: null, revoke_request_id: null, refresh_token_ciphertext: initial.refresh_token_ciphertext });
    expect(log).not.toHaveBeenCalled();
  });
});

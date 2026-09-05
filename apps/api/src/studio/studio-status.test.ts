import "reflect-metadata";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { PoolClient } from "pg";
import { RegistrationControl, StudioStatusService, requireOpenStudio, statusFromRow } from "./studio-status.service.js";
import { loadRuntimeConfig, type RuntimeConfigService } from "../config/runtime-config.js";
import type { DatabaseService } from "../database/database.service.js";

afterEach(() => { vi.unstubAllGlobals(); });
describe("studio opening and identity synchronization", () => {
  it("fails closed for missing, closed and pending state", async () => {
    for (const row of [undefined, { requested_open: false, registration_synced: true }, { requested_open: true, registration_synced: false }]) {
      expect(statusFromRow(row).open).toBe(false);
      const query = vi.fn(async () => ({ rows: row ? [row] : [] }));
      await expect(requireOpenStudio({ query } as unknown as PoolClient)).rejects.toMatchObject({ response: { code: "STUDIO_CLOSED" } });
      expect(query).toHaveBeenCalledWith(expect.stringContaining("FOR SHARE"));
    }
    await expect(requireOpenStudio({ query: async () => ({ rows: [{ requested_open: true, registration_synced: true }] }) } as unknown as PoolClient)).resolves.toBeUndefined();
  });
  it("keeps failed synchronization pending and recovers on retry", async () => {
    const row = { requested_open: false, registration_synced: true };
    const query = vi.fn(async (sql: string, args?: unknown[]) => {
      if (sql.includes("SET requested_open")) { row.requested_open = args![0] as boolean; row.registration_synced = false; }
      if (sql.includes("SET registration_synced=true")) row.registration_synced = true;
      return { rows: [{ ...row }] };
    });
    const database = { query, transaction: async (work: (client: unknown) => unknown) => work({ query }) } as unknown as DatabaseService;
    const setAllowed = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const service = new StudioStatusService(database, { setAllowed } as unknown as RegistrationControl);
    await expect(service.update(true, "admin", "req-test")).rejects.toMatchObject({ status: 503 });
    expect(await service.get()).toMatchObject({ open: false, requestedOpen: true, registrationSynced: false });
    await service.synchronize();
    expect(await service.get()).toMatchObject({ open: true, registrationSynced: true });
    await service.update(false, "admin", "req-close");
    expect(await service.get()).toMatchObject({ open: false, requestedOpen: false, registrationSynced: true });
    expect(setAllowed.mock.calls).toEqual([[true], [true], [false]]);
  });
  it("updates only registrationAllowed in the dedicated realm and verifies it", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-token" })))
      .mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(JSON.stringify({ registrationAllowed: false })));
    vi.stubGlobal("fetch", fetch);
    const config = { value: loadRuntimeConfig({ APP_ENV: "test", OIDC_OPERATIONS_CLIENT_SECRET: "test-secret" }) } as RuntimeConfigService;
    await new RegistrationControl(config).setAllowed(false);
    expect(fetch.mock.calls[1]![0]).toBe("http://localhost:8081/admin/realms/studio-balance");
    expect(fetch.mock.calls[1]![1].body).toBe('{"registrationAllowed":false}');
  });
});

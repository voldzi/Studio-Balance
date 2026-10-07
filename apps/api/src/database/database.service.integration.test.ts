import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { DatabaseService } from "./database.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("application transaction idle timeout (local PostgreSQL)", () => {
  it("overrides a stricter role default and keeps a short provider wait inside a transaction usable", async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require a local database.");
    const role = `studio_idle_test_${randomUUID().replaceAll("-", "")}`;
    const password = randomUUID().replaceAll("-", "");
    const admin = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    let roleCreated = false;
    let baseline: Client | undefined;
    let service: DatabaseService | undefined;
    await admin.connect();
    try {
      // These utility statement identifiers/credentials are generated hex/ASCII,
      // isolated to this fixture, and never come from a request or production env.
      await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
      roleCreated = true;
      await admin.query(`ALTER ROLE "${role}" SET idle_in_transaction_session_timeout = '1s'`);
      url.username = role;
      url.password = password;
      url.search = "";
      baseline = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 });
      await baseline.connect();
      expect((await baseline.query("SHOW idle_in_transaction_session_timeout")).rows[0]?.idle_in_transaction_session_timeout).toBe("1s");

      service = new DatabaseService({ value: { databaseUrl: url.toString() } } as never);
      expect((await service.query("SHOW idle_in_transaction_session_timeout")).rows[0]?.idle_in_transaction_session_timeout).toBe("30s");
      const result = await service.transaction(async (client) => {
        await client.query("SELECT 1");
        await delay(1_100);
        return (await client.query("SELECT 42 AS result")).rows[0]?.result;
      });
      expect(result).toBe(42);
    } finally {
      await service?.onModuleDestroy();
      await baseline?.end();
      if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
      await admin.end();
    }
  }, 15_000);
});

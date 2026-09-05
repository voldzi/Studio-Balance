import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client, Pool, type PoolClient } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { requireOpenStudio } from "./studio-status.service.js";
import { BookingService } from "../booking/booking.service.js";
import { AccountService } from "../account/account.service.js";
import type { DatabaseService } from "../database/database.service.js";

const url = process.env.STUDIO_TEST_DATABASE_URL;
describe.skipIf(!url)("studio opening transactions in local PostgreSQL", () => {
  const schema = `studio_open_test_${randomUUID().replaceAll("-", "")}`;
  let owner: Client;
  let pool: Pool;
  let database: DatabaseService;
  beforeAll(async () => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url!).hostname)) throw new Error("Local database only");
    owner = new Client({ connectionString: url }); await owner.connect();
    await owner.query(`CREATE SCHEMA "${schema}"`);
    await owner.query(`SET search_path TO "${schema}", public`);
    const directory = new URL("../../../../infra/postgres/migrations/", import.meta.url);
    for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) await owner.query(await readFile(new URL(file, directory), "utf8"));
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
    database = { query: (sql: string, args?: unknown[]) => pool.query(sql,args), transaction: async (work: (client: PoolClient) => Promise<unknown>) => {
      const client = await pool.connect(); try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    } } as DatabaseService;
  }, 30000);
  afterAll(async () => { await pool?.end(); if (owner) { await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await owner.end(); } });
  it("serializes closing with a booking gate already held", async () => {
    await pool.query("UPDATE studio_operation SET requested_open=true, registration_synced=true");
    const booking = await pool.connect(); const closing = await pool.connect();
    try {
      await booking.query("BEGIN"); await requireOpenStudio(booking);
      await closing.query("BEGIN"); await closing.query("SET LOCAL lock_timeout='100ms'");
      await expect(closing.query("UPDATE studio_operation SET requested_open=false")).rejects.toMatchObject({ code: "55P03" });
      await closing.query("ROLLBACK"); await booking.query("COMMIT");
      await closing.query("UPDATE studio_operation SET requested_open=false");
      await expect(requireOpenStudio(booking)).rejects.toMatchObject({ response: { code: "STUDIO_CLOSED" } });
    } finally { await booking.query("ROLLBACK"); await closing.query("ROLLBACK"); booking.release(); closing.release(); }
  });
  it("rejects a new booking while closed and replays an existing success after closing", async () => {
    const session = { subject: randomUUID(), email: "opening-test@example.test", emailVerified: false, roles: ["client" as const], mfaVerified: false };
    const accounts = new AccountService(database);
    await accounts.updateProfile(session, { firstName: "Test", lastName: "Opening", phone: "+420777123456" });
    const row = await pool.query(`INSERT INTO class_sessions (class_type_id,instructor_id,start_at,end_at,arrival_lead_minutes,location_name,location_address,price_cents,capacity,booking_opens_at,booking_closes_at)
      SELECT ct.id,i.id,now()+interval '3 days',now()+interval '3 days 1 hour',10,'Studio','Test',16000,10,now()-interval '1 day',now()+interval '2 days'
      FROM class_types ct CROSS JOIN instructors i LIMIT 1 RETURNING id`);
    const service = new BookingService(database,accounts);
    const input = { session, sessionId: row.rows[0].id as string, idempotencyKey: randomUUID(), requestId: "opening-test", termsVersion: "2026-08-04" as const, termsAccepted: true as const };
    await expect(service.create(input)).rejects.toMatchObject({ response: { code: "STUDIO_CLOSED" } });
    await pool.query("UPDATE studio_operation SET requested_open=true, registration_synced=true");
    const created = await service.create(input);
    await pool.query("UPDATE studio_operation SET requested_open=false");
    expect((await service.create(input)).id).toBe(created.id);
    await expect(service.create({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ response: { code: "STUDIO_CLOSED" } });
  });
});

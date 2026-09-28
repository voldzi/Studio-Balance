import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../admin/admin.service.js";
import { BookingService } from "../booking/booking.service.js";
import type { StudioSession } from "../auth/session.js";
import type { AccountService } from "../account/account.service.js";
import type { DatabaseService } from "./database.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);
const adminContext = { requestId: "price-test", session: { subject: "studio-admin" } as StudioSession };

describe.skipIf(!databaseUrl)("admin class-wide pricing (local PostgreSQL)", () => {
  let client: Client;
  let schema: string;
  let admin: AdminService;
  let database: DatabaseService;
  let classTypeId: string;
  let bookingId: string;
  let userId: string;
  let futureSessionId: string;
  let cancelledSessionId: string;
  let pastSessionId: string;

  beforeEach(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require a local database.");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    schema = `studio_class_price_test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await client.query(await readFile(new URL(file, migrations), "utf8"));
    }
    database = {
      query: client.query.bind(client),
      transaction: async (work: (db: Client) => Promise<unknown>) => {
        await client.query("BEGIN");
        try { const result = await work(client); await client.query("COMMIT"); return result; }
        catch (error) { await client.query("ROLLBACK"); throw error; }
      }
    } as unknown as DatabaseService;
    admin = new AdminService(database);
    classTypeId = (await client.query<{ id: string }>("SELECT id FROM class_types WHERE slug='balance-flow'")).rows[0]!.id;
    await client.query("UPDATE weekly_schedule_rules SET price_cents=20000 WHERE class_type_id=$1", [classTypeId]);
    const instructorId = (await client.query<{ id: string }>("SELECT id FROM instructors WHERE active=true LIMIT 1")).rows[0]!.id;
    async function session(offset: string, status: string, price: number) {
      const result = await client.query<{ id: string }>(`INSERT INTO class_sessions
        (class_type_id,instructor_id,start_at,end_at,location_name,location_address,price_cents,capacity,booking_opens_at,booking_closes_at,status)
        VALUES ($1,$2,now()+$3::interval,now()+$3::interval+interval '1 hour','Studio Balance','Ruská 10, Bruntál',$4,10,
          now()+$3::interval-interval '30 days',now()+$3::interval-interval '30 minutes',$5) RETURNING id`,
      [classTypeId, instructorId, offset, price, status]);
      return result.rows[0]!.id;
    }
    futureSessionId = await session("45 days", "scheduled", 20000);
    cancelledSessionId = await session("52 days", "cancelled", 20000);
    pastSessionId = await session("-10 days", "completed", 20000);
    userId = (await client.query<{ id: string }>("INSERT INTO user_profiles (oidc_subject,email) VALUES ($1,$2) RETURNING id", [randomUUID(), "price-client@example.test"])).rows[0]!.id;
    bookingId = (await client.query<{ id: string }>(`INSERT INTO bookings
      (user_id,session_id,status,source,price_snapshot_cents,terms_version,cancellation_cutoff_at)
      SELECT $1,$2,'reserved','web',20000,'test',start_at-interval '24 hours'
      FROM class_sessions WHERE id=$2 RETURNING id`, [userId, futureSessionId])).rows[0]!.id;
  }, 30_000);

  afterEach(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => undefined);
    if (schema) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  const input = (id: string, updateBookedPrices: boolean) => ({ classTypeId: id, priceCents: 16000, updateBookedPrices, reason: "Nový ceník lekcí." });

  it("updates future rules and terms while preserving existing booking prices by default", async () => {
    const data = input(classTypeId, false);
    const preview = await admin.previewClassPrice(data);
    expect(preview.weeklyRulesChanged).toBe(2);
    expect(preview.sessionsChanged).toBeGreaterThanOrEqual(2);
    expect(preview.activeBookings).toBe(1);
    expect(preview.bookedPricesChanged).toBe(0);
    await admin.applyClassPrice({ ...data, previewToken: preview.previewToken }, adminContext);
    const rules = await client.query<{ price_cents: number }>("SELECT price_cents FROM weekly_schedule_rules WHERE class_type_id=$1", [classTypeId]);
    expect(rules.rows.every((row) => row.price_cents === 16000)).toBe(true);
    const prices = await client.query<{ id: string; price_cents: number }>("SELECT id,price_cents FROM class_sessions WHERE id=ANY($1::uuid[])", [[futureSessionId, cancelledSessionId, pastSessionId]]);
    expect(Object.fromEntries(prices.rows.map((row) => [row.id, row.price_cents]))).toEqual({ [futureSessionId]: 16000, [cancelledSessionId]: 16000, [pastSessionId]: 20000 });
    expect((await client.query<{ price_snapshot_cents: number }>("SELECT price_snapshot_cents FROM bookings WHERE id=$1", [bookingId])).rows[0]!.price_snapshot_cents).toBe(20000);
    const booking = new BookingService(database, { ensureProfile: async () => ({ id: userId }) } as unknown as AccountService);
    const account = await booking.listMine({ subject: "price-client" } as StudioSession);
    expect(account.items.find((item) => item.id === bookingId)?.session.price.amount).toBe("200.00");
  });

  it("changes booked prices only after an explicit preview and records notice and audit", async () => {
    const data = input(classTypeId, true);
    const preview = await admin.previewClassPrice(data);
    expect(preview.bookedPricesChanged).toBe(1);
    await admin.applyClassPrice({ ...data, previewToken: preview.previewToken }, adminContext);
    expect((await client.query<{ price_snapshot_cents: number }>("SELECT price_snapshot_cents FROM bookings WHERE id=$1", [bookingId])).rows[0]!.price_snapshot_cents).toBe(16000);
    const booking = new BookingService(database, { ensureProfile: async () => ({ id: userId }) } as unknown as AccountService);
    const account = await booking.listMine({ subject: "price-client" } as StudioSession);
    expect(account.items.find((item) => item.id === bookingId)?.session.price.amount).toBe("160.00");
    expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM account_notifications WHERE booking_id=$1 AND title LIKE 'Změna ceny%'", [bookingId])).rows[0]!.count).toBe(1);
    expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM application_audit WHERE action='booking.price_corrected' AND entity_id=$1", [bookingId])).rows[0]!.count).toBe(1);
  });

  it("rejects a stale preview after a new booking without changing prices", async () => {
    const data = input(classTypeId, true);
    const preview = await admin.previewClassPrice(data);
    const secondUser = (await client.query<{ id: string }>("INSERT INTO user_profiles (oidc_subject,email) VALUES ($1,$2) RETURNING id", [randomUUID(), "second-price-client@example.test"])).rows[0]!.id;
    await client.query(`INSERT INTO bookings (user_id,session_id,status,source,price_snapshot_cents,terms_version,cancellation_cutoff_at)
      SELECT $1,$2,'reserved','web',20000,'test',start_at-interval '24 hours' FROM class_sessions WHERE id=$2`, [secondUser, futureSessionId]);
    await expect(admin.applyClassPrice({ ...data, previewToken: preview.previewToken }, adminContext)).rejects.toThrow("Zkontrolujte dopad");
    expect((await client.query<{ price_cents: number }>("SELECT price_cents FROM class_sessions WHERE id=$1", [futureSessionId])).rows[0]!.price_cents).toBe(20000);
  });

  it("rejects the whole booked-price change when a fee is due", async () => {
    await client.query("INSERT INTO cancellation_fees (booking_id,user_id,amount_cents) VALUES ($1,$2,20000)", [bookingId, userId]);
    const data = input(classTypeId, true);
    const preview = await admin.previewClassPrice(data);
    expect(preview.blockedBookings).toBe(1);
    await expect(admin.applyClassPrice({ ...data, previewToken: preview.previewToken }, adminContext)).rejects.toThrow("storno poplatek");
    expect((await client.query<{ price_cents: number }>("SELECT price_cents FROM class_sessions WHERE id=$1", [futureSessionId])).rows[0]!.price_cents).toBe(20000);
  });
});

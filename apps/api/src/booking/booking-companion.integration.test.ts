import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client, Pool, type PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountService } from "../account/account.service.js";
import { AdminService } from "../admin/admin.service.js";
import type { StudioSession } from "../auth/session.js";
import type { DatabaseService } from "../database/database.service.js";
import { BookingService, CURRENT_TERMS_VERSION } from "./booking.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);

describe.skipIf(!databaseUrl)("companion reservations (isolated local PostgreSQL)", () => {
  let client: Client;
  let pool: Pool;
  let schema: string;
  let bookings: BookingService;
  let admin: AdminService;
  let owner: StudioSession;
  let other: StudioSession;
  let sessionId: string;
  let startAt: Date;
  const context = { requestId: "companion-admin", session: { subject: "admin" } as StudioSession };

  beforeEach(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Local database only");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    schema = `companion_test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await client.query(await readFile(new URL(file, migrations), "utf8"));
    }
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public`, max: 5 });
    const database = {
      query: pool.query.bind(pool),
      transaction: async <T>(work: (db: PoolClient) => Promise<T>) => {
        const db = await pool.connect();
        try { await db.query("BEGIN"); const result = await work(db); await db.query("COMMIT"); return result; }
        catch (error) { await db.query("ROLLBACK"); throw error; }
        finally { db.release(); }
      }
    } as unknown as DatabaseService;
    bookings = new BookingService(database, new AccountService(database));
    admin = new AdminService(database);
    owner = { subject: randomUUID(), email: "owner@example.test", emailVerified: true, roles: ["client"], mfaVerified: false };
    other = { ...owner, subject: randomUUID(), email: "other@example.test" };
    for (const user of [owner, other]) await client.query(`INSERT INTO user_profiles
      (oidc_subject,email,first_name,last_name,phone) VALUES ($1,$2,'Test','Klient','+420123456789')`, [user.subject,user.email]);
    await client.query("UPDATE studio_operation SET requested_open=true,registration_synced=true");
    startAt = new Date(Date.now() + 3 * 86400_000);
    sessionId = (await client.query<{ id: string }>(`INSERT INTO class_sessions
      (class_type_id,instructor_id,start_at,end_at,location_name,location_address,price_cents,capacity,booking_opens_at,booking_closes_at)
      SELECT ct.id,i.id,$1,$1::timestamptz+interval '1 hour','Studio','Test',27000,8,
        $1::timestamptz-interval '30 days',$1::timestamptz-interval '30 minutes'
      FROM class_types ct CROSS JOIN instructors i LIMIT 1 RETURNING id`, [startAt])).rows[0]!.id;
  },30_000);

  afterEach(async () => {
    vi.useRealTimers();
    if (pool) await pool.end();
    if (!client) return;
    if (schema) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  function input(session = owner): Parameters<BookingService["create"]>[0] {
    return { session, sessionId, requestId: randomUUID(), idempotencyKey: randomUUID(),
      termsVersion: CURRENT_TERMS_VERSION, termsAccepted: true as const,
      companionName: "Jana Doprovod", companionResponsibilityAccepted: true as const };
  }
  async function count() { return (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM bookings WHERE session_id=$1 AND status='reserved'", [sessionId])).rows[0]!.count; }
  function cancel(bookingId: string, lateCancellationConfirmed = false, session = owner) {
    return bookings.cancel({ bookingId, lateCancellationConfirmed, session, requestId: randomUUID(), idempotencyKey: randomUUID() });
  }

  it("creates two priced seats, named roster participants and explicit consent", async () => {
    const receipt = await bookings.create(input());
    expect(receipt.participant).toEqual({ kind: "self", name: null });
    expect(receipt.companionBooking?.participant).toEqual({ kind: "companion", name: "Jana Doprovod" });
    expect(receipt.id).not.toBe(receipt.companionBooking?.id);
    expect(receipt.session.price).toEqual({ amount: "270.00", currency: "CZK" });
    expect(receipt.companionBooking?.session.price).toEqual(receipt.session.price);
    expect(await count()).toBe(2);
    const mine = await bookings.listMine(owner);
    expect(mine.items).toHaveLength(2);
    const roster = await admin.listBookings(sessionId);
    expect(roster.items.map((item) => item.participant.kind).sort()).toEqual(["companion","self"]);
    expect(roster.items.every((item) => item.user.email === owner.email)).toBe(true);
    expect((await client.query("SELECT 1 FROM bookings WHERE participant_kind='companion' AND companion_responsibility_accepted_at IS NOT NULL AND terms_version=$1", [CURRENT_TERMS_VERSION])).rowCount).toBe(1);
    expect((await client.query("SELECT 1 FROM notification_outbox WHERE kind='booking_confirmation' AND payload->>'participant' LIKE 'Doprovod:%'")).rowCount).toBe(1);
    expect(JSON.stringify(receipt.session)).not.toMatch(/capacity|activeBookings|remaining/);
  });

  it("preserves the one-seat flow and prevents a second active companion", async () => {
    const single = { ...input(), companionName: undefined, companionResponsibilityAccepted: undefined };
    const receipt = await bookings.create(single);
    expect(receipt.companionBooking).toBeUndefined();
    expect(await count()).toBe(1);
    await expect(bookings.create(input())).rejects.toMatchObject({ response: { code: "BOOKING_ALREADY_EXISTS" } });
  });

  it("rejects a pair with one free seat without creating half a reservation", async () => {
    await client.query("UPDATE class_sessions SET capacity=1 WHERE id=$1", [sessionId]);
    await expect(bookings.create(input())).rejects.toMatchObject({ response: { code: "SESSION_FULL" } });
    expect(await count()).toBe(0);
    expect((await client.query("SELECT 1 FROM booking_idempotency")).rowCount).toBe(0);
    expect((await client.query("SELECT 1 FROM account_notifications")).rowCount).toBe(0);
  });

  it("serializes concurrent owners competing for three seats", async () => {
    await client.query("UPDATE class_sessions SET capacity=3 WHERE id=$1", [sessionId]);
    const results = await Promise.allSettled([bookings.create(input()), bookings.create(input(other))]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(await count()).toBe(2);
  });

  it("replays concurrent retries once and rejects changed companion payload", async () => {
    const request = input();
    const [first, retry] = await Promise.all([bookings.create(request),bookings.create(request)]);
    expect(retry).toEqual(first);
    expect(await count()).toBe(2);
    expect((await client.query("SELECT 1 FROM application_audit WHERE action='booking.created'")).rowCount).toBe(2);
    await expect(bookings.create({ ...request, companionName: "Jiný Doprovod" })).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
  });

  it("cancels only the companion at the exact 24-hour boundary", async () => {
    const receipt = await bookings.create(input());
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(startAt.getTime() - 86400_000));
    const result = await cancel(receipt.companionBooking!.id);
    expect(result.status).toBe("cancelled_on_time");
    expect(result.fee).toBeNull();
    expect(await count()).toBe(1);
    expect((await bookings.listMine(owner)).items.find((item) => item.id === receipt.id)?.status).toBe("reserved");
  });

  it("charges each late seat separately to its owner and requires confirmation", async () => {
    const receipt = await bookings.create(input());
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(startAt.getTime() - 86400_000 + 1000));
    await expect(cancel(receipt.companionBooking!.id)).rejects.toMatchObject({ response: { code: "LATE_CANCELLATION_CONFIRMATION_REQUIRED" } });
    for (const id of [receipt.id,receipt.companionBooking!.id]) {
      const cancelled = await cancel(id,true);
      expect(cancelled.fee).toEqual({ amount: "270.00", currency: "CZK" });
    }
    const fees = await client.query<{ amount: number; count: number }>("SELECT sum(amount_cents)::int AS amount,count(*)::int AS count FROM cancellation_fees WHERE user_id=(SELECT id FROM user_profiles WHERE oidc_subject=$1)", [owner.subject]);
    expect(fees.rows[0]).toEqual({ amount: 54000, count: 2 });
    expect(await count()).toBe(0);
  });

  it("allows the companion to remain after cancelling self; no additional pair", async () => {
    const receipt = await bookings.create(input());
    await cancel(receipt.id);
    expect(await count()).toBe(1);
    await expect(bookings.create(input())).rejects.toMatchObject({ response: { code: "BOOKING_ALREADY_EXISTS" } });
  });

  it("hides both participants from a different owner's cancellation endpoints", async () => {
    const receipt = await bookings.create(input());
    expect((await bookings.listMine(other)).items).toHaveLength(0);
    await expect(bookings.cancellationPreview(other,receipt.companionBooking!.id)).rejects.toMatchObject({ response: { code: "RESOURCE_NOT_FOUND" } });
    await expect(cancel(receipt.id,false,other)).rejects.toMatchObject({ response: { code: "RESOURCE_NOT_FOUND" } });
    expect(await count()).toBe(2);
  });

  it("records attendance and a no-show fee separately for companion", async () => {
    const receipt = await bookings.create(input());
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(startAt.getTime()+1000));
    await admin.attendance(receipt.id,"attended","Dorazil",context);
    await admin.attendance(receipt.companionBooking!.id,"no_show","Nedorazila",context);
    const fee = (await client.query<{ booking_id: string; amount_cents: number }>("SELECT booking_id,amount_cents FROM cancellation_fees")).rows;
    expect(fee).toEqual([{ booking_id: receipt.companionBooking!.id, amount_cents: 27000 }]);
  });

  it("studio cancellation cancels both seats without fees", async () => {
    const receipt = await bookings.create(input());
    await admin.cancelSession(sessionId,"Studio lekci ruší",context);
    const mine = await bookings.listMine(owner);
    expect(mine.items.map((item) => item.status)).toEqual(["cancelled_by_studio","cancelled_by_studio"]);
    expect((await client.query("SELECT 1 FROM cancellation_fees WHERE booking_id=ANY($1::uuid[])",[[receipt.id,receipt.companionBooking!.id]])).rowCount).toBe(0);
  });

  it("uses elapsed 24 hours across Prague daylight-saving transition", async () => {
    const autumn = new Date("2026-10-25T08:00:00Z"); // Prague 09:00, after the clock change.
    await client.query("UPDATE class_sessions SET start_at=$2,end_at=$2::timestamptz+interval '1 hour',booking_opens_at=$2::timestamptz-interval '30 days',booking_closes_at=$2::timestamptz-interval '30 minutes' WHERE id=$1",[sessionId,autumn]);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-23T08:00:00Z"));
    const receipt = await bookings.create(input());
    expect(receipt.cancellationCutoffAt).toBe("2026-10-24T08:00:00.000Z");
    vi.setSystemTime(new Date("2026-10-24T08:00:00Z"));
    expect((await bookings.cancellationPreview(owner,receipt.companionBooking!.id)).mode).toBe("on_time");
    vi.setSystemTime(new Date("2026-10-24T08:00:01Z"));
    expect((await bookings.cancellationPreview(owner,receipt.companionBooking!.id)).mode).toBe("late");
  });
});

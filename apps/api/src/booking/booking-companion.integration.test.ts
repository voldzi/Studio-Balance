import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client, Pool, type PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountService } from "../account/account.service.js";
import { ScheduleService } from "../schedule/schedule.service.js";
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
  let schedule: ScheduleService;
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
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public`, application_name: schema, max: 5 });
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
    schedule = new ScheduleService(database);
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

  it("hides inactive lessons and rejects new bookings while preserving existing bookings", async () => {
    const receipt = await bookings.create(input());
    const type = (await client.query<{ id: string; slug: string }>("SELECT ct.id,ct.slug FROM class_types ct JOIN class_sessions s ON s.class_type_id=ct.id WHERE s.id=$1", [sessionId])).rows[0]!;
    expect(await schedule.getSession(sessionId)).toBeDefined();
    await client.query("UPDATE class_types SET active=false WHERE id=$1", [type.id]);
    expect((await schedule.listClassTypes()).items.some((item) => item.id === type.id)).toBe(false);
    expect(await schedule.getClassType(type.slug)).toBeUndefined();
    expect((await schedule.listSessions(new Date(), new Date(startAt.getTime()+86400_000))).items.some((item) => item.id===sessionId)).toBe(false);
    expect(await schedule.getSession(sessionId)).toBeUndefined();
    await expect(bookings.create(input(other))).rejects.toMatchObject({ response: { code: "RESOURCE_NOT_FOUND" } });
    expect(await count()).toBe(2);
    expect((await bookings.listMine(owner)).items.map((item) => item.id)).toContain(receipt.id);
  });

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
  it("refuses both premature attendance states without changing either companion seat or fees", async () => {
    const receipt = await bookings.create(input());
    const original = (await client.query("SELECT id,status,updated_at FROM bookings WHERE session_id=$1 ORDER BY id", [sessionId])).rows;
    for (const id of [receipt.id, receipt.companionBooking!.id]) {
      for (const status of ["attended", "no_show"] as const) {
        await expect(admin.attendance(id,status,"Lekce ještě nezačala",context)).rejects.toMatchObject({ response: { code: "STATE_CONFLICT" } });
      }
    }
    expect((await client.query("SELECT id,status,updated_at FROM bookings WHERE session_id=$1 ORDER BY id", [sessionId])).rows).toEqual(original);
    expect((await client.query("SELECT 1 FROM cancellation_fees")).rowCount).toBe(0);
    expect((await client.query("SELECT 1 FROM application_audit WHERE action='booking.attendance_changed'")).rowCount).toBe(0);
  });

  it("keeps legacy recorded attendance occupied in capacity checks, public availability and rosters", async () => {
    await client.query("UPDATE class_sessions SET capacity=2 WHERE id=$1", [sessionId]);
    const receipt = await bookings.create(input());
    // Earlier releases allowed attendance before start. Existing rows still
    // occupy capacity even though new premature confirmations are refused.
    await client.query("UPDATE bookings SET status='attended' WHERE id=$1", [receipt.id]);
    expect((await schedule.getSession(sessionId))?.availability).toBe("full");
    const terms = await admin.listSessions(new Date(startAt.getTime()-1000),new Date(startAt.getTime()+1000));
    expect(terms.items.find((item) => item.id === sessionId)?.bookingCount).toBe(2);
    await expect(admin.updateSessionCapacity(sessionId,1,context)).rejects.toMatchObject({ response: { code: "STATE_CONFLICT" } });
    await expect(bookings.create({ ...input(other), companionName: undefined, companionResponsibilityAccepted: undefined })).rejects.toMatchObject({ response: { code: "SESSION_FULL" } });
    const editable = terms.items.find((item) => item.id === sessionId)!;
    await expect(admin.updateSession(sessionId,{ ...editable, durationMinutes: 60, capacity: 1 },context)).rejects.toMatchObject({ response: { code: "STATE_CONFLICT" } });
    const rule = (await client.query<{ id: string; instructor_id: string; weekday: number; local_start_time: string }>("SELECT id,instructor_id,weekday,local_start_time FROM weekly_schedule_rules WHERE class_type_id=$1 ORDER BY id LIMIT 1",[editable.classTypeId])).rows[0]!;
    await client.query(`UPDATE class_sessions SET weekly_rule_id=$2,
      weekly_occurrence_date=((now() AT TIME ZONE 'Europe/Prague')::date + ((($3::int-extract(isodow FROM now() AT TIME ZONE 'Europe/Prague')::int+7)%7)+7)),
      start_at=((((now() AT TIME ZONE 'Europe/Prague')::date + ((($3::int-extract(isodow FROM now() AT TIME ZONE 'Europe/Prague')::int+7)%7)+7)) + $4::time) AT TIME ZONE 'Europe/Prague'),
      end_at=((((now() AT TIME ZONE 'Europe/Prague')::date + ((($3::int-extract(isodow FROM now() AT TIME ZONE 'Europe/Prague')::int+7)%7)+7)) + $4::time) AT TIME ZONE 'Europe/Prague') + interval '1 hour'
      WHERE id=$1`,[sessionId,rule.id,rule.weekday,rule.local_start_time]);
    const today = (await client.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Prague')::date::text AS today")).rows[0]!.today;
    await expect(admin.previewScheduleChange({ ruleIds: [rule.id], from: today, operation: "edit", capacity: 1, reopenCancelled: false, updateBookedPrices: false, reason: "Kapacita" })).rejects.toMatchObject({ response: { code: "BOOKING_STATE_CONFLICT" } });
    const ruleChange = { weekday: rule.weekday, localStartTime: rule.local_start_time.slice(0,5), instructorId: rule.instructor_id, capacity: 1, bookingLeadDays: 30, reason: "Kapacita" };
    const preview = await admin.previewWeeklyRuleEdit(rule.id,ruleChange);
    expect(preview.activeBookings).toBe(2);
    await expect(admin.applyWeeklyRuleEdit(rule.id,{ ...ruleChange, previewToken: preview.previewToken },context)).rejects.toMatchObject({ response: { code: "STATE_CONFLICT" } });
    await client.query("UPDATE class_sessions SET capacity=4 WHERE id=$1", [sessionId]);
    await expect(bookings.create(input())).rejects.toMatchObject({ response: { code: "BOOKING_ALREADY_EXISTS" } });
    expect((await client.query("SELECT status FROM bookings WHERE id=$1", [receipt.id])).rows[0].status).toBe("attended");
    expect((await client.query("SELECT status FROM bookings WHERE id=$1", [receipt.companionBooking!.id])).rows[0].status).toBe("reserved");
  });

  it("serializes valid attendance and a late booking attempt under the session lock", async () => {
    await client.query("UPDATE class_sessions SET capacity=1 WHERE id=$1", [sessionId]);
    const single = { ...input(), companionName: undefined, companionResponsibilityAccepted: undefined };
    const receipt = await bookings.create(single);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(startAt.getTime()+1000));
    await client.query("BEGIN");
    await client.query("SELECT id FROM class_sessions WHERE id=$1 FOR UPDATE",[sessionId]);
    const attendance = admin.attendance(receipt.id,"attended","Dorazil",context);
    const creation = bookings.create({ ...single, session: other, idempotencyKey: randomUUID() });
    // Attach rejection handlers immediately, then prove both operations really
    // reached their session lock before releasing the competing transaction.
    const resultsPromise = Promise.allSettled([attendance,creation]);
    try {
      await vi.waitFor(async () => {
        await client.query("SELECT pg_stat_clear_snapshot()");
        const waiting = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",[schema]);
        expect(waiting.rows[0]!.count).toBeGreaterThanOrEqual(2);
      },{ timeout: 3000, interval: 20 });
    } finally { await client.query("COMMIT"); }
    const results = await resultsPromise;
    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]).toMatchObject({ status: "rejected", reason: { response: { code: "BOOKING_CLOSED" } } });
    expect((await client.query("SELECT 1 FROM bookings WHERE session_id=$1 AND status='attended'",[sessionId])).rowCount).toBe(1);
    expect((await client.query("SELECT 1 FROM bookings WHERE session_id=$1",[sessionId])).rowCount).toBe(1);
    expect((await schedule.getSession(sessionId))?.availability).toBe("closed");
  },10_000);

  it("rolls class, session and instructor changes back when audit insertion fails", async () => {
    const type = (await admin.listClassTypes()).items[0]!;
    const instructor = (await admin.listInstructors()).items[0]!;
    const term = (await admin.listSessions(new Date(startAt.getTime()-1000),new Date(startAt.getTime()+1000))).items.find((item) => item.id === sessionId)!;
    await client.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'synthetic audit failure'; END; $$;
      CREATE TRIGGER reject_test_audit BEFORE INSERT ON application_audit FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`);
    const changed = { ...type, name: "Synthetic changed lesson" };
    await expect(admin.updateClassType(type.id,changed,context)).rejects.toThrow("synthetic audit failure");
    expect((await admin.listClassTypes()).items.find((item) => item.id === type.id)?.name).toBe(type.name);
    const created = { ...type, slug: `synthetic-${randomUUID()}`, name: "Synthetic new lesson" };
    await expect(admin.createClassType(created,context)).rejects.toThrow("synthetic audit failure");
    expect((await client.query("SELECT 1 FROM class_types WHERE slug=$1",[created.slug])).rowCount).toBe(0);
    const nextStart = new Date(startAt.getTime()+86400_000).toISOString();
    await expect(admin.createSession({ ...term, startAt: nextStart, durationMinutes: 60 },context)).rejects.toThrow("synthetic audit failure");
    expect((await client.query("SELECT 1 FROM class_sessions WHERE start_at=$1",[nextStart])).rowCount).toBe(0);
    await expect(admin.updateInstructor(instructor.id,{ ...instructor, displayName: "Synthetic changed instructor" },context)).rejects.toThrow("synthetic audit failure");
    expect((await admin.listInstructors()).items.find((item) => item.id === instructor.id)?.displayName).toBe(instructor.displayName);
    await expect(admin.createInstructor({ displayName: "Synthetic new instructor", bio: "Test only", active: true, sortOrder: 999 },context)).rejects.toThrow("synthetic audit failure");
    expect((await client.query("SELECT 1 FROM instructors WHERE display_name='Synthetic new instructor'")).rowCount).toBe(0);
  });

  it("pages every seat with tied start times and rejects cursors from other owners or filters", async () => {
    const receipt = await bookings.create(input());
    // pg preserves microseconds; a JavaScript Date cursor would otherwise lose
    // precision and repeat/skip seats sharing this session on the next page.
    await client.query("UPDATE class_sessions SET start_at=date_trunc('milliseconds',start_at)+interval '123 microseconds' WHERE id=$1",[sessionId]);
    const first = await bookings.listMine(owner,{ limit: 1, period: "upcoming" });
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String));
    const second = await bookings.listMine(owner,{ limit: 1, period: "upcoming", cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items,...second.items].map((item) => item.id))).toEqual(new Set([receipt.id,receipt.companionBooking!.id]));
    expect((await bookings.listMine(owner,{ period: "history" })).items).toEqual([]);
    await expect(bookings.listMine(other,{ limit: 1, period: "upcoming", cursor: first.nextCursor! })).rejects.toMatchObject({ response: { code: "VALIDATION_ERROR" } });
    await expect(bookings.listMine(owner,{ limit: 1, period: "history", cursor: first.nextCursor! })).rejects.toMatchObject({ response: { code: "VALIDATION_ERROR" } });
    await expect(bookings.listMine(owner,{ cursor: "e30" })).rejects.toMatchObject({ response: { code: "VALIDATION_ERROR" } });
    const roster = await admin.listBookings(sessionId,{ limit: 1 });
    const more = await admin.listBookings(sessionId,{ limit: 1, cursor: roster.nextCursor! });
    expect(more.nextCursor).toBeNull(); expect(new Set([...roster.items,...more.items].map((item) => item.id)).size).toBe(2);
    await expect(admin.listBookings(undefined,{ cursor: roster.nextCursor! })).rejects.toMatchObject({ response: { code: "VALIDATION_ERROR" } });
  });

  it("keeps Prague date filters inclusive across the 25-hour autumn day", async () => {
    const receipt = await bookings.create(input());
    await client.query("UPDATE class_sessions SET start_at='2026-10-24T22:00:00Z',end_at='2026-10-24T23:00:00Z' WHERE id=$1",[sessionId]);
    for (const time of ["2026-10-25T22:59:59Z","2026-10-25T23:00:00Z"]) {
      const termId = (await client.query<{ id: string }>(`INSERT INTO class_sessions
        (class_type_id,instructor_id,start_at,end_at,location_name,location_address,price_cents,capacity,booking_opens_at,booking_closes_at)
        SELECT class_type_id,instructor_id,$2,$2::timestamptz+interval '1 hour',location_name,location_address,price_cents,capacity,
          $2::timestamptz-interval '30 days',$2::timestamptz-interval '30 minutes' FROM class_sessions WHERE id=$1 RETURNING id`,[sessionId,time])).rows[0]!.id;
      await client.query(`INSERT INTO bookings (user_id,session_id,source,price_snapshot_cents,terms_version,cancellation_cutoff_at)
        SELECT user_id,$2,source,price_snapshot_cents,terms_version,cancellation_cutoff_at FROM bookings WHERE id=$1`,[receipt.id,termId]);
    }
    const dates = { from: "2026-10-25", through: "2026-10-25" };
    const mine = await bookings.listMine(owner,dates);
    expect(mine.items).toHaveLength(3); // Two seats at midnight plus one at 23:59:59.
    expect(mine.items.map((item) => item.session.startAt)).not.toContain("2026-10-25T23:00:00.000Z");
    expect((await admin.listBookings(undefined,dates)).items).toHaveLength(3);
    await expect(bookings.listMine(owner,{ from: "2026-10-26", through: "2026-10-25" })).rejects.toMatchObject({ response: { code: "VALIDATION_ERROR" } });
  });

});

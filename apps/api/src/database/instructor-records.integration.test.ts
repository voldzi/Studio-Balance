import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client, Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminService } from "../admin/admin.service.js";
import { applyAttendanceWithClient, type AttendanceBookingRow } from "../admin/attendance-mutation.js";
import { InstructorRecordsService, type SessionCompletionInput } from "../admin/instructor-records.service.js";
import type { StudioSession } from "../auth/session.js";
import type { DatabaseService } from "./database.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);
const context = { requestId: "instructor-record-test", session: { subject: "studio-admin" } as StudioSession };

describe.skipIf(!databaseUrl)("one-step attendance and operational instructor evidence (local PostgreSQL)", () => {
  let setup: Client; let pool: Pool; let schema: string;
  let service: InstructorRecordsService; let admin: AdminService;
  let sessionId: string; let instructorId: string; let substituteId: string; let selfId: string; let companionId: string; let userId: string;

  beforeEach(async () => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl!).hostname)) throw new Error("Integration tests require a local database.");
    setup = new Client({ connectionString: databaseUrl }); await setup.connect();
    await setup.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    schema = `studio_instructor_records_${randomUUID().replaceAll("-", "")}`;
    await setup.query(`CREATE SCHEMA "${schema}"`); await setup.query(`SET search_path TO "${schema}",public`);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await setup.query(await readFile(new URL(file, migrations), "utf8"));
    }
    pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: schema, options: `-c search_path=${schema},public` });
    const database = { query: pool.query.bind(pool), transaction: async (work: Parameters<DatabaseService["transaction"]>[0]) => {
      const client = await pool.connect(); await client.query("BEGIN");
      try { const result = await work(client); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    } } as unknown as DatabaseService;
    service = new InstructorRecordsService(database); admin = new AdminService(database);
    instructorId = (await setup.query("SELECT id FROM instructors ORDER BY id LIMIT 1")).rows[0].id;
    substituteId = (await setup.query("SELECT id FROM instructors WHERE id<>$1 ORDER BY id LIMIT 1", [instructorId])).rows[0].id;
    sessionId = (await setup.query(`INSERT INTO class_sessions
      (class_type_id,instructor_id,start_at,end_at,location_name,location_address,price_cents,capacity,booking_opens_at,booking_closes_at)
      SELECT id,$1,date_trunc('hour',now()-interval '2 days'),date_trunc('hour',now()-interval '2 days')+interval '1 hour',
        'Test studio','Test address',16000,14,now()-interval '32 days',now()-interval '3 days'
      FROM class_types WHERE slug='trx' RETURNING id`, [instructorId])).rows[0].id;
    userId = (await setup.query("INSERT INTO user_profiles (oidc_subject,email,first_name,last_name) VALUES ($1,'instructor-record-client@example.test','Test','Klient') RETURNING id", [randomUUID()])).rows[0].id;
    selfId = await booking("self"); companionId = await booking("companion");
  }, 30_000);

  afterEach(async () => {
    await pool?.end();
    if (setup) { if (schema) await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await setup.end(); }
  });
  async function booking(kind: "self" | "companion") {
    return (await setup.query(`INSERT INTO bookings
      (user_id,session_id,status,source,price_snapshot_cents,terms_version,cancellation_cutoff_at,participant_kind,participant_name,companion_responsibility_accepted_at)
      SELECT $1,$2,'reserved','web',16000,'test',start_at-interval '24 hours',$3,$4,$5 FROM class_sessions WHERE id=$2 RETURNING id`,
      [userId,sessionId,kind,kind === "companion" ? "Test doprovod" : null,kind === "companion" ? new Date() : null])).rows[0].id as string;
  }
  async function input(overrides: Partial<SessionCompletionInput> = {}) {
    const form = await service.getCompletion(sessionId);
    return { instructorId, startAt: form.session.startAt, endAt: form.session.endAt, rewardCents: 45000,
      absentBookingIds: [], expectedVersion: form.record?.version ?? null, rosterToken: form.rosterToken, reason: "Potvrzení skutečně odučené lekce.", ...overrides };
  }
  async function month() {
    return (await setup.query("SELECT to_char(start_at AT TIME ZONE 'Europe/Prague','YYYY-MM') AS month FROM class_sessions WHERE id=$1", [sessionId])).rows[0].month as string;
  }

  it("atomically counts self and companion separately, charges only absence, and records a substitute", async () => {
    const result = await service.complete(sessionId, await input({ instructorId: substituteId, absentBookingIds: [companionId], rewardCents: null }), context);
    expect(result).toMatchObject({ attendedCount: 1, noShowCount: 1, record: { instructorId: substituteId, minutes: 60, participants: 1, rewardCents: null, attendanceChanged: false } });
    expect((await setup.query("SELECT status FROM bookings WHERE id=$1", [selfId])).rows[0].status).toBe("attended");
    expect((await setup.query("SELECT amount_cents,status FROM cancellation_fees WHERE booking_id=$1", [companionId])).rows[0]).toEqual({ amount_cents: 16000, status: "due" });
    const records = await service.listMonth(await month());
    expect(records.summary).toEqual([expect.objectContaining({ instructorId: substituteId, lessons: 1, minutes: 60, rewardCents: 0, pendingRewards: 1 })]);
    expect(records.unconfirmedSessions.some((s) => s.id === sessionId)).toBe(false);
    const persisted = (await setup.query("SELECT original_snapshot,confirmed_by FROM instructor_lesson_records WHERE session_id=$1", [sessionId])).rows[0];
    expect(persisted.original_snapshot.instructorId).toBe(instructorId);
    expect(persisted.confirmed_by).toBe("studio-admin");
  });

  it("does not infer taught lessons or attendance, and rejects future/cancelled/invalid actual times", async () => {
    const records = await service.listMonth(await month());
    expect(records.records).toEqual([]);
    expect(records.unconfirmedSessions.some((s) => s.id === sessionId)).toBe(true);
    const data = await input();
    await expect(service.complete(sessionId, { ...data, endAt: data.startAt }, context)).rejects.toThrow("15 až 240");
    await setup.query("UPDATE class_sessions SET start_at=now()+interval '2 days',end_at=now()+interval '2 days 1 hour' WHERE id=$1", [sessionId]);
    await expect(service.complete(sessionId, data, context)).rejects.toThrow("po skončení");
    await setup.query("UPDATE class_sessions SET status='cancelled' WHERE id=$1", [sessionId]);
    await expect(service.complete(sessionId, data, context)).rejects.toThrow("Zrušenou");
    expect((await setup.query("SELECT status FROM bookings WHERE id=$1", [selfId])).rows[0].status).toBe("reserved");
    expect((await setup.query("SELECT count(*)::int AS n FROM instructor_lesson_records")).rows[0].n).toBe(0);
  });

  it("rejects a stale roster after another attendance change and preserves settled fees", async () => {
    const data = await input();
    await admin.attendance(companionId, "no_show", "Ověřená neúčast doprovodu.", context);
    await setup.query("UPDATE cancellation_fees SET status='settled',settlement_method='cash',settled_at=now() WHERE booking_id=$1", [companionId]);
    await expect(service.complete(sessionId, data, context)).rejects.toThrow("Seznam účastníků");
    expect((await setup.query("SELECT count(*)::int AS n FROM instructor_lesson_records")).rows[0].n).toBe(0);
    const result = await service.complete(sessionId, await input(), context);
    expect(result).toMatchObject({ attendedCount: 1, noShowCount: 1 });
    expect((await setup.query("SELECT status FROM cancellation_fees WHERE booking_id=$1", [companionId])).rows[0].status).toBe("settled");
  });

  it("serializes concurrent completions and makes identical retries idempotent", async () => {
    const data = await input();
    const results = await Promise.all([service.complete(sessionId, data, context), service.complete(sessionId, data, context)]);
    expect(results[0].record.id).toBe(results[1].record.id);
    expect((await setup.query("SELECT count(*)::int AS n FROM instructor_lesson_records WHERE session_id=$1", [sessionId])).rows[0].n).toBe(1);
    expect((await setup.query("SELECT count(*)::int AS n FROM application_audit WHERE action='instructor_lesson_record.confirmed'")).rows[0].n).toBe(1);
    const edit = await input();
    const attempts = await Promise.allSettled([service.complete(sessionId, { ...edit, rewardCents: 35000 }, context), service.complete(sessionId, { ...edit, rewardCents: 50000 }, context)]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await setup.query("SELECT version FROM instructor_lesson_records WHERE session_id=$1", [sessionId])).rows[0].version).toBe(2);
  });

  it("retains original names/history and flags later attendance without changing an agreed reward", async () => {
    await service.complete(sessionId, await input(), context);
    await setup.query("UPDATE class_types SET name='Pozdější název' WHERE slug='trx'");
    await admin.attendance(companionId, "no_show", "Pozdější oprava účasti.", context);
    const record = (await service.listMonth(await month())).records.find((r) => r.sessionId === sessionId)!;
    expect(record).toMatchObject({ className: "TRX", participants: 2, rewardCents: 45000, attendanceChanged: true, version: 1 });
    const correction = await service.complete(sessionId, await input({ rewardCents: 35000, reason: "Oprava odměny po kontrole účasti." }), context);
    expect(correction.record).toMatchObject({ className: "TRX", participants: 1, rewardCents: 35000, attendanceChanged: false, version: 2 });
    const audit = (await setup.query("SELECT metadata FROM application_audit WHERE action='instructor_lesson_record.corrected'")).rows[0].metadata;
    expect(audit).toMatchObject({ before: { rewardCents: 45000, version: 1 }, after: { rewardCents: 35000, version: 2 } });
  });

  it("detects an equal-count correction from an older transaction waiting behind confirmation, including an identical retry", async () => {
    const data = await input({ absentBookingIds: [companionId] });
    const holder = await pool.connect(); const earlier = await pool.connect();
    let completing: ReturnType<InstructorRecordsService["complete"]> | undefined;
    let waiting: Promise<unknown> | undefined;
    try {
      await holder.query("BEGIN"); await holder.query("SELECT id FROM class_sessions WHERE id=$1 FOR UPDATE", [sessionId]);
      await earlier.query("BEGIN"); await earlier.query("SELECT pg_sleep(0.03)");
      completing = service.complete(sessionId, data, context);
      // Prove completion has queued first, so the older transaction mutates after the record is committed.
      let queued = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        queued = (await pool.query<{ queued: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE OF s%') AS queued`, [schema])).rows[0]!.queued;
        if (queued) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(queued).toBe(true);
      waiting = earlier.query("SELECT id FROM class_sessions WHERE id=$1 FOR UPDATE", [sessionId]);
      await holder.query("COMMIT"); await completing; await waiting;
      const rows = (await earlier.query<AttendanceBookingRow>("SELECT id,user_id,status,price_snapshot_cents FROM bookings WHERE session_id=$1 ORDER BY id FOR UPDATE", [sessionId])).rows;
      for (const row of rows) await applyAttendanceWithClient(earlier, row, row.id === selfId ? "no_show" : "attended", "Oprava obou účastníků po kontrole.", context);
      await earlier.query("COMMIT");
      // The old timestamp/count heuristic would miss this: count stayed one and both mutation timestamps are older.
      expect((await setup.query(`SELECT max(b.updated_at)<r.updated_at AS timestamps_older,
        count(*) FILTER (WHERE b.status='attended')::int AS attended FROM bookings b
        JOIN instructor_lesson_records r ON r.session_id=b.session_id WHERE r.session_id=$1 GROUP BY r.updated_at`, [sessionId])).rows[0])
        .toEqual({ timestamps_older: true, attended: 1 });
      expect((await service.getCompletion(sessionId)).record).toMatchObject({ attendanceChanged: true, participants: 1, rewardCents: 45000 });
      expect((await service.listMonth(await month())).records.find((r) => r.sessionId === sessionId)).toMatchObject({ attendanceChanged: true });
      const replay = await service.complete(sessionId, data, context);
      expect(replay).toMatchObject({ record: { attendanceChanged: true, version: 1, rewardCents: 45000 }, attendedCount: 1, noShowCount: 1 });
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined); await earlier.query("ROLLBACK").catch(() => undefined);
      await completing?.catch(() => undefined); await waiting?.catch(() => undefined);
      holder.release(); earlier.release();
    }
  });

  it("uses Prague calendar months and elapsed minutes across DST", async () => {
    await setup.query("UPDATE class_sessions SET start_at='2024-03-31T23:00:00+02',end_at='2024-04-01T00:00:00+02',booking_opens_at='2024-03-01T00:00:00Z',booking_closes_at='2024-03-31T20:00:00Z' WHERE id=$1", [sessionId]);
    await service.complete(sessionId, await input(), context);
    expect((await service.listMonth("2024-03")).summary).toEqual([expect.objectContaining({ lessons: 1, minutes: 60 })]);
    expect((await service.listMonth("2024-04")).records).toEqual([]);
    await setup.query("DELETE FROM instructor_lesson_records WHERE session_id=$1", [sessionId]);
    await setup.query("UPDATE class_sessions SET start_at='2024-10-27T02:30:00+02',end_at='2024-10-27T02:30:00+01',booking_opens_at='2024-09-27T00:00:00Z',booking_closes_at='2024-10-26T23:00:00Z' WHERE id=$1", [sessionId]);
    await service.complete(sessionId, await input(), context);
    expect((await service.listMonth("2024-10")).summary).toEqual([expect.objectContaining({ lessons: 1, minutes: 60 })]);
  });

  it("rejects absent IDs from cancelled reservations without making any partial attendance writes", async () => {
    await setup.query("UPDATE bookings SET status='cancelled_on_time',cancelled_at=now() WHERE id=$1", [companionId]);
    await expect(service.complete(sessionId, await input({ absentBookingIds: [companionId] }), context)).rejects.toThrow("Neúčast vybírejte");
    expect((await setup.query("SELECT status FROM bookings WHERE id=$1", [selfId])).rows[0].status).toBe("reserved");
    expect((await setup.query("SELECT count(*)::int AS n FROM instructor_lesson_records")).rows[0].n).toBe(0);
  });
});

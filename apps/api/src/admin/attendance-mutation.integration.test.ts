import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StudioSession } from "../auth/session.js";
import type { DatabaseService } from "../database/database.service.js";
import { AdminService } from "./admin.service.js";
import { InstructorRecordsService } from "./instructor-records.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);
const context = { requestId: "attendance-fee-test", session: { subject: "attendance-admin" } as StudioSession };

describe.skipIf(!databaseUrl)("attendance financial history (local PostgreSQL)", () => {
  let client: Client;
  let schema: string;
  let admin: AdminService;
  let database: DatabaseService;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Attendance integration tests require a local database.");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    schema = `studio_attendance_test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await client.query(await readFile(new URL(file, migrations), "utf8"));
    }
    database = {
      transaction: async (work: (db: Client) => Promise<unknown>) => {
        await client.query("BEGIN");
        try { const result = await work(client); await client.query("COMMIT"); return result; }
        catch (error) { await client.query("ROLLBACK"); throw error; }
      }
    } as unknown as DatabaseService;
    admin = new AdminService(database);
  }, 30_000);

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => undefined);
    if (schema) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  async function booking(status = "reserved") {
    const { id: classId } = (await client.query<{ id: string }>("SELECT id FROM class_types WHERE active=true LIMIT 1")).rows[0]!;
    const { id: instructorId } = (await client.query<{ id: string }>("SELECT id FROM instructors WHERE active=true LIMIT 1")).rows[0]!;
    const { id: sessionId } = (await client.query<{ id: string }>(`INSERT INTO class_sessions
      (class_type_id,instructor_id,start_at,end_at,location_name,location_address,price_cents,capacity,booking_opens_at,booking_closes_at,status)
      VALUES ($1,$2,now()-interval '2 days',now()-interval '2 days'+interval '1 hour','Studio','Test',16000,10,
        now()-interval '32 days',now()-interval '2 days'-interval '30 minutes','scheduled') RETURNING id`, [classId, instructorId])).rows[0]!;
    const { id: userId } = (await client.query<{ id: string }>("INSERT INTO user_profiles (oidc_subject,email) VALUES ($1,$2) RETURNING id", [randomUUID(), `attendance-${randomUUID()}@example.test`])).rows[0]!;
    const { id } = (await client.query<{ id: string }>(`INSERT INTO bookings
      (user_id,session_id,status,source,price_snapshot_cents,terms_version,cancellation_cutoff_at)
      SELECT $1,$2,$3,'web',16000,'test',start_at-interval '24 hours' FROM class_sessions WHERE id=$2 RETURNING id`, [userId, sessionId, status])).rows[0]!;
    return { id, userId, sessionId, instructorId };
  }

  async function fee(id: string) {
    return (await client.query("SELECT id,amount_cents,status,settlement_method,settled_at,created_at,updated_at FROM cancellation_fees WHERE booking_id=$1", [id])).rows[0];
  }

  it("creates one fee and preserves its amount and identity across attendance corrections", async () => {
    const { id } = await booking();
    await admin.attendance(id, "no_show", "Nepřišla.", context);
    const original = await fee(id);
    expect(original).toMatchObject({ amount_cents: 16000, status: "due" });
    await admin.attendance(id, "no_show", "Dvojklik.", context);
    expect(await fee(id)).toEqual(original);
    expect((await client.query("SELECT count(*)::int AS count FROM application_audit WHERE entity_id=$1", [id])).rows[0].count).toBe(1);
    await admin.attendance(id, "attended", "Oprava přítomnosti.", context);
    expect(await fee(id)).toMatchObject({ id: original.id, status: "cancelled", amount_cents: 16000 });
    await client.query("UPDATE bookings SET price_snapshot_cents=20000 WHERE id=$1", [id]);
    await admin.attendance(id, "no_show", "Oprava přítomnosti zpět.", context);
    expect(await fee(id)).toMatchObject({ id: original.id, status: "due", amount_cents: 16000, created_at: original.created_at });
  });

  it.each(["settled", "waived"])("retains %s amounts, disposition and settlement history", async (status) => {
    const { id, userId } = await booking("no_show");
    await client.query(`INSERT INTO cancellation_fees (booking_id,user_id,amount_cents,status,settlement_method,settled_at)
      VALUES ($1,$2,20000,$3,CASE WHEN $3='settled' THEN 'cash' ELSE NULL END,
        CASE WHEN $3='settled' THEN now() ELSE NULL END)`, [id, userId, status]);
    const original = await fee(id);
    await admin.attendance(id, "attended", "Oprava.", context);
    await admin.attendance(id, "no_show", "Další oprava.", context);
    expect(await fee(id)).toEqual(original);
    const audits = (await client.query("SELECT metadata FROM application_audit WHERE entity_id=$1 ORDER BY occurred_at", [id])).rows;
    expect(audits).toHaveLength(2);
    expect(audits.every((entry) => entry.metadata.previousFeeStatus === status && entry.metadata.feeChange === null)).toBe(true);
  });

  it("never resurrects a cancelled booking or rewrites its fee", async () => {
    const { id, userId } = await booking("cancelled_late");
    await client.query("INSERT INTO cancellation_fees (booking_id,user_id,amount_cents) VALUES ($1,$2,16000)", [id, userId]);
    const original = await fee(id);
    await expect(admin.attendance(id, "attended", "Neplatná oprava.", context)).rejects.toMatchObject({ status: 409 });
    expect(await fee(id)).toEqual(original);
    expect((await client.query("SELECT status FROM bookings WHERE id=$1", [id])).rows[0].status).toBe("cancelled_late");
  });


  it("rejects cancellation after lesson confirmation and preserves record, attendance, fee and audit history", async () => {
    const { id, userId, sessionId, instructorId } = await booking("no_show");
    await client.query("INSERT INTO cancellation_fees (booking_id,user_id,amount_cents) VALUES ($1,$2,16000)", [id, userId]);
    const records = new InstructorRecordsService(database);
    const form = await records.getCompletion(sessionId);
    const minute = (value: string) => new Date(Math.floor(Date.parse(value) / 60000) * 60000).toISOString();
    await records.complete(sessionId, { instructorId, startAt: minute(form.session.startAt), endAt: minute(form.session.endAt),
      rewardCents: 35000, absentBookingIds: [], rosterToken: form.rosterToken, expectedVersion: null, reason: "Lekce byla odučena." }, context);
    const originalRecord = (await client.query("SELECT * FROM instructor_lesson_records WHERE session_id=$1", [sessionId])).rows[0];
    const originalSession = (await client.query("SELECT * FROM class_sessions WHERE id=$1", [sessionId])).rows[0];
    const originalFee = await fee(id);
    const originalAuditCount = (await client.query("SELECT count(*)::int AS count FROM application_audit")).rows[0].count;
    await expect(admin.cancelSession(sessionId, "Chybný pokus zrušit odučenou lekci.", context)).rejects.toMatchObject({ status: 409, response: { code: "STATE_CONFLICT" } });
    expect((await client.query("SELECT * FROM instructor_lesson_records WHERE session_id=$1", [sessionId])).rows[0]).toEqual(originalRecord);
    expect((await client.query("SELECT * FROM class_sessions WHERE id=$1", [sessionId])).rows[0]).toEqual(originalSession);
    expect(await fee(id)).toEqual(originalFee);
    expect((await client.query("SELECT status FROM bookings WHERE id=$1", [id])).rows[0].status).toBe("no_show");
    expect((await client.query("SELECT count(*)::int AS count FROM application_audit")).rows[0].count).toBe(originalAuditCount);
  });

  it("rolls back both attendance and new fee when the audit cannot be recorded", async () => {
    const { id } = await booking();
    await client.query("ALTER TABLE application_audit ADD CONSTRAINT reject_attendance_test_audit CHECK (request_id <> 'reject-attendance-test')");
    try {
      await expect(admin.attendance(id, "no_show", "Nepřišla.", { ...context, requestId: "reject-attendance-test" })).rejects.toThrow();
      expect((await client.query("SELECT status FROM bookings WHERE id=$1", [id])).rows[0].status).toBe("reserved");
      expect(await fee(id)).toBeUndefined();
    } finally { await client.query("ALTER TABLE application_audit DROP CONSTRAINT reject_attendance_test_audit"); }
  });
});

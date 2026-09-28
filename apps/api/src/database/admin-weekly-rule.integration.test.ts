import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../admin/admin.service.js";
import type { StudioSession } from "../auth/session.js";
import type { DatabaseService } from "./database.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);
const context = { requestId: "weekly-edit-test", session: { subject: "studio-admin" } as StudioSession };

describe.skipIf(!databaseUrl)("admin recurring lesson edit (local PostgreSQL)", () => {
  let client: Client;
  let schema: string;
  let admin: AdminService;
  let ruleId: string;
  let newInstructorId: string;
  let sessionId: string;
  let bookingId: string;
  let localDate: string;

  beforeEach(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require a local database.");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    schema = `studio_weekly_edit_test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await client.query(await readFile(new URL(file, migrations), "utf8"));
    }
    const database = {
      query: client.query.bind(client),
      transaction: async (work: (db: Client) => Promise<unknown>) => {
        await client.query("BEGIN");
        try { const result = await work(client); await client.query("COMMIT"); return result; }
        catch (error) { await client.query("ROLLBACK"); throw error; }
      }
    } as unknown as DatabaseService;
    admin = new AdminService(database);
    const rule = (await client.query<{ id: string; instructor_id: string; class_type_id: string }>(`SELECT id,instructor_id,class_type_id
      FROM weekly_schedule_rules WHERE class_type_id=(SELECT id FROM class_types WHERE slug='barre') AND weekday=3`)).rows[0]!;
    ruleId = rule.id;
    newInstructorId = (await client.query<{ id: string }>("SELECT id FROM instructors WHERE id<>$1 AND active=true LIMIT 1", [rule.instructor_id])).rows[0]!.id;
    localDate = (await client.query<{ date: string }>(`SELECT (day + ((3 - extract(isodow FROM day)::int + 7) % 7))::text AS date
      FROM (SELECT (now() AT TIME ZONE 'Europe/Prague')::date + 75 AS day) dates`)).rows[0]!.date;
    sessionId = (await client.query<{ id: string }>(`INSERT INTO class_sessions
      (class_type_id,instructor_id,start_at,end_at,location_name,location_address,price_cents,capacity,
       booking_opens_at,booking_closes_at,weekly_rule_id,weekly_occurrence_date)
      SELECT $1,$2,start_at,start_at+interval '1 hour','Studio Balance','Ruská 10, 792 01 Bruntál',27000,8,
        start_at-interval '30 days',start_at-interval '30 minutes',$3,$4::date
      FROM (SELECT (($4::date + time '08:00') AT TIME ZONE 'Europe/Prague') AS start_at) times RETURNING id`,
      [rule.class_type_id,rule.instructor_id,ruleId,localDate])).rows[0]!.id;
    const userId = (await client.query<{ id: string }>("INSERT INTO user_profiles (oidc_subject,email) VALUES ($1,$2) RETURNING id", [randomUUID(), "weekly-client@example.test"])).rows[0]!.id;
    bookingId = (await client.query<{ id: string }>(`INSERT INTO bookings
      (user_id,session_id,status,source,price_snapshot_cents,terms_version,cancellation_cutoff_at)
      SELECT $1,$2,'reserved','web',27000,'test',start_at-interval '24 hours' FROM class_sessions WHERE id=$2 RETURNING id`,
      [userId,sessionId])).rows[0]!.id;
  }, 30_000);

  afterEach(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => undefined);
    if (schema) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  function input(capacity = 7) {
    return { weekday: 3, localStartTime: "09:00", instructorId: newInstructorId,
      capacity, bookingLeadDays: 45, reason: "Změna středečního ranního rozvrhu." };
  }

  it("moves matching future terms, preserves bookings and price, and notifies clients", async () => {
    const data = input();
    const preview = await admin.previewWeeklyRuleEdit(ruleId, data);
    expect(preview.futureSessions).toBeGreaterThanOrEqual(1);
    expect(preview).toMatchObject({ bookedSessions: 1, activeBookings: 1 });
    const result = await admin.applyWeeklyRuleEdit(ruleId, { ...data, previewToken: preview.previewToken }, context);
    expect(result).toMatchObject({ futureSessions: preview.futureSessions, activeBookings: 1 });
    const rule = (await client.query<{ weekday: number; capacity: number; booking_lead_days: number; instructor_id: string }>(
      "SELECT weekday,capacity,booking_lead_days,instructor_id FROM weekly_schedule_rules WHERE id=$1", [ruleId])).rows[0]!;
    expect(rule).toMatchObject({ weekday: 3, capacity: 7, booking_lead_days: 45, instructor_id: newInstructorId });
    const session = (await client.query<{ local_time: string; capacity: number; instructor_id: string; lead_days: number }>(`SELECT
      to_char(start_at AT TIME ZONE 'Europe/Prague','HH24:MI') AS local_time,capacity,instructor_id,
      (extract(epoch FROM start_at-booking_opens_at)/86400)::int AS lead_days FROM class_sessions WHERE id=$1`, [sessionId])).rows[0]!;
    expect(session).toMatchObject({ local_time: "09:00", capacity: 7, instructor_id: newInstructorId, lead_days: 45 });
    expect((await client.query<{ price_snapshot_cents: number }>("SELECT price_snapshot_cents FROM bookings WHERE id=$1 AND status='reserved'", [bookingId])).rows[0]!.price_snapshot_cents).toBe(27000);
    expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM account_notifications WHERE booking_id=$1 AND kind='session_changed'", [bookingId])).rows[0]!.count).toBe(1);
    expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM application_audit WHERE entity_id=$1 AND action='weekly_schedule_rule.updated'", [ruleId])).rows[0]!.count).toBe(1);
  });

  it("refuses capacity below confirmed bookings without changing the rule", async () => {
    const data = input(1);
    const secondUserId = (await client.query<{ id: string }>(
      "INSERT INTO user_profiles (oidc_subject,email) VALUES ($1,$2) RETURNING id",
      [randomUUID(),"second-weekly@example.test"])).rows[0]!.id;
    await client.query(`INSERT INTO bookings (user_id,session_id,status,source,price_snapshot_cents,terms_version,cancellation_cutoff_at)
      SELECT $1,$2,'reserved','web',27000,'test',start_at-interval '24 hours'
      FROM class_sessions WHERE id=$2`, [secondUserId,sessionId]);
    const preview = await admin.previewWeeklyRuleEdit(ruleId, data);
    await expect(admin.applyWeeklyRuleEdit(ruleId, { ...data, previewToken: preview.previewToken }, context)).rejects.toThrow("Kapacita");
    expect((await client.query<{ capacity: number }>("SELECT capacity FROM weekly_schedule_rules WHERE id=$1", [ruleId])).rows[0]!.capacity).toBe(8);
  });

  it("rejects a stale preview after another booking", async () => {
    const data = input();
    const preview = await admin.previewWeeklyRuleEdit(ruleId, data);
    const userId = (await client.query<{ id: string }>("INSERT INTO user_profiles (oidc_subject,email) VALUES ($1,$2) RETURNING id", [randomUUID(), "late-weekly@example.test"])).rows[0]!.id;
    await client.query(`INSERT INTO bookings (user_id,session_id,status,source,price_snapshot_cents,terms_version,cancellation_cutoff_at)
      SELECT $1,$2,'reserved','web',27000,'test',start_at-interval '24 hours' FROM class_sessions WHERE id=$2`, [userId,sessionId]);
    await expect(admin.applyWeeklyRuleEdit(ruleId, { ...data, previewToken: preview.previewToken }, context)).rejects.toThrow("Zkontrolujte dopad");
  });

  it("moves the recurring weekday and keeps the generated occurrence linked to its new date", async () => {
    const data = { ...input(), weekday: 5 };
    const preview = await admin.previewWeeklyRuleEdit(ruleId, data);
    await admin.applyWeeklyRuleEdit(ruleId, { ...data, previewToken: preview.previewToken }, context);
    const row = (await client.query<{ weekday: number; local_date: string; occurrence_date: string }>(`SELECT
      extract(isodow FROM start_at AT TIME ZONE 'Europe/Prague')::int AS weekday,
      (start_at AT TIME ZONE 'Europe/Prague')::date::text AS local_date,
      weekly_occurrence_date::text AS occurrence_date FROM class_sessions WHERE id=$1`, [sessionId])).rows[0]!;
    expect(row.weekday).toBe(5);
    expect(row.local_date).toBe(row.occurrence_date);
    expect(row.local_date).not.toBe(localDate);
  });

  it("keeps Prague local time across spring DST when changing the series", async () => {
    const rule = (await client.query<{ class_type_id: string; instructor_id: string }>(
      "SELECT class_type_id,instructor_id FROM weekly_schedule_rules WHERE id=$1", [ruleId])).rows[0]!;
    for (const date of ["2027-03-24", "2027-03-31"]) {
      await client.query(`INSERT INTO class_sessions
        (class_type_id,instructor_id,start_at,end_at,location_name,location_address,price_cents,capacity,
         booking_opens_at,booking_closes_at,weekly_rule_id,weekly_occurrence_date)
        SELECT $1,$2,start_at,start_at+interval '1 hour','Studio Balance','Ruská 10, 792 01 Bruntál',27000,8,
          start_at-interval '30 days',start_at-interval '30 minutes',$3,$4::date
        FROM (SELECT (($4::date + time '08:00') AT TIME ZONE 'Europe/Prague') AS start_at) times`,
        [rule.class_type_id,rule.instructor_id,ruleId,date]);
    }
    const data = input();
    const preview = await admin.previewWeeklyRuleEdit(ruleId, data);
    await admin.applyWeeklyRuleEdit(ruleId, { ...data, previewToken: preview.previewToken }, context);
    const result = await client.query<{ local_date: string; local_time: string; offset_hour: number }>(`SELECT
      weekly_occurrence_date::text AS local_date,
      to_char(start_at AT TIME ZONE 'Europe/Prague','HH24:MI') AS local_time,
      extract(hour FROM start_at AT TIME ZONE 'UTC')::int AS offset_hour
      FROM class_sessions WHERE weekly_rule_id=$1 AND weekly_occurrence_date IN ('2027-03-24','2027-03-31')
      ORDER BY weekly_occurrence_date`, [ruleId]);
    expect(result.rows).toEqual([
      { local_date: "2027-03-24", local_time: "09:00", offset_hour: 8 },
      { local_date: "2027-03-31", local_time: "09:00", offset_hour: 7 }
    ]);
  });

  it("rejects a collision without changing the rule or reservation", async () => {
    const otherType = (await client.query<{ id: string }>("SELECT id FROM class_types WHERE slug='trx'")).rows[0]!.id;
    await client.query(`INSERT INTO class_sessions
      (class_type_id,instructor_id,start_at,end_at,location_name,location_address,price_cents,capacity,
       booking_opens_at,booking_closes_at)
      SELECT $1,$2,start_at,start_at+interval '1 hour','Studio Balance','Ruská 10, 792 01 Bruntál',16000,8,
        start_at-interval '30 days',start_at-interval '30 minutes'
      FROM (SELECT (($3::date + time '09:00') AT TIME ZONE 'Europe/Prague') AS start_at) times`,
      [otherType,newInstructorId,localDate]);
    const data = input();
    const preview = await admin.previewWeeklyRuleEdit(ruleId, data);
    await expect(admin.applyWeeklyRuleEdit(ruleId, { ...data, previewToken: preview.previewToken }, context)).rejects.toThrow("koliduje");
    expect((await client.query<{ local_time: string }>(`SELECT to_char(start_at AT TIME ZONE 'Europe/Prague','HH24:MI') AS local_time
      FROM class_sessions WHERE id=$1`, [sessionId])).rows[0]!.local_time).toBe("08:00");
    expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM account_notifications WHERE booking_id=$1", [bookingId])).rows[0]!.count).toBe(0);
  });

  it("rejects an overlapping recurring rule beyond the existing session horizon", async () => {
    await expect(admin.previewWeeklyRuleEdit(ruleId, { ...input(), localStartTime: "16:00" }))
      .rejects.toThrow("pravidelný čas koliduje");
  });
});

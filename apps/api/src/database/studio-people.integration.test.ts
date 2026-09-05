import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cancellationMode } from "@studiobalance/domain";
import { ScheduleService } from "../schedule/schedule.service.js";
import { AdminService } from "../admin/admin.service.js";
import type { StudioSession } from "../auth/session.js";
import type { DatabaseService } from "./database.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const directory = new URL("../../../../infra/postgres/migrations/", import.meta.url);
const katka = "10000000-0000-4000-8000-000000000005";
const nicola = "10000000-0000-4000-8000-000000000001";
const monika = "10000000-0000-4000-8000-000000000007";
const movedSql = await readFile(new URL("0017_barre_strength_wednesday.sql", directory), "utf8");

describe.skipIf(!databaseUrl)("studio portraits and the Wednesday migration (local PostgreSQL)", () => {
  let client: Client;
  let schema: string;
  let oldStart: string;

  beforeEach(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require a local database.");
    client = new Client({ connectionString: databaseUrl }); await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    schema = `studio_people_test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql") && name < "0017").sort()) {
      await client.query(await readFile(new URL(file, directory), "utf8"));
    }
    await client.query(await readFile(new URL("0018_studio_opening.sql", directory), "utf8"));
    await client.query("UPDATE studio_operation SET requested_open=true, registration_synced=true");
    const date = new Date(Date.UTC(new Date().getUTCFullYear() + 2, 2, 23));
    while (date.getUTCDay() !== 4) date.setUTCDate(date.getUTCDate() + 1);
    oldStart = `${date.toISOString().slice(0, 10)} 08:30 Europe/Prague`;
  }, 30_000);

  afterEach(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    if (schema) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  async function session(start = oldStart, instructor = katka, slug = "barre-strength", notice: string | null = null) {
    const result = await client.query<{ id: string }>(`INSERT INTO class_sessions
      (class_type_id,instructor_id,start_at,end_at,arrival_lead_minutes,location_name,location_address,
      price_cents,capacity,booking_opens_at,booking_closes_at,change_notice)
      SELECT id,$1,$2::timestamptz,$2::timestamptz+interval '1 hour',10,'Studio Balance','Ruská 10, 792 01 Bruntál',
      25000,10,$2::timestamptz-interval '30 days',$2::timestamptz-interval '30 minutes',$3 FROM class_types WHERE slug=$4 RETURNING id`,
    [instructor,start,notice,slug]);
    return result.rows[0]!.id;
  }
  async function migrate() { await client.query("BEGIN"); try { await client.query(movedSql); await client.query("COMMIT"); } catch (error) { await client.query("ROLLBACK"); throw error; } }
  const local = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);

  it("preserves booked IDs/prices, gives a free-change window and replaces reminder times atomically", async () => {
    const id = await session();
    const user = (await client.query("INSERT INTO user_profiles (oidc_subject,email,email_verified) VALUES ('test','test@example.test',false) RETURNING id")).rows[0].id;
    const booked = (await client.query(`INSERT INTO bookings (user_id,session_id,source,price_snapshot_cents,terms_version,cancellation_cutoff_at)
      VALUES ($1,$2,'web',23000,'test',$3::timestamptz-interval '24 hours') RETURNING id,cancellation_cutoff_at`, [user,id,oldStart])).rows[0];
    await client.query(`INSERT INTO notification_outbox (user_id,booking_id,kind,channel,scheduled_at,payload)
      VALUES ($1,$2,'lesson_reminder','email',$3::timestamptz-interval '2 hours','{}')`, [user,booked.id,oldStart]);
    await migrate();
    const s = (await client.query("SELECT * FROM class_sessions WHERE id=$1", [id])).rows[0];
    const b = (await client.query("SELECT * FROM bookings WHERE id=$1", [booked.id])).rows[0];
    expect(local(s.start_at)).toBe("Wed 08:30"); expect(local(s.end_at)).toBe("Wed 09:30");
    expect(b.session_id).toBe(id); expect(b.price_snapshot_cents).toBe(23000); expect(b.status).toBe("reserved");
    expect(s.start_at.getTime()-b.cancellation_cutoff_at.getTime()).toBe(86_400_000);
    expect(s.free_cancellation_until.getTime()).toBe(booked.cancellation_cutoff_at.getTime());
    expect(cancellationMode({ now: new Date(b.cancellation_cutoff_at.getTime()+1), cutoffAt: b.cancellation_cutoff_at, freeCancellationUntil: s.free_cancellation_until })).toBe("free_change_window");
    const reminders = (await client.query("SELECT * FROM notification_outbox WHERE booking_id=$1 AND kind='lesson_reminder' AND status='pending' ORDER BY scheduled_at", [b.id])).rows;
    expect(reminders.map((r) => (s.start_at.getTime()-r.scheduled_at.getTime())/60000)).toEqual([1440,120,30]);
    expect(reminders.every((r) => new Date(r.payload.startAt).getTime()===s.start_at.getTime())).toBe(true);
    expect((await client.query("SELECT count(*)::int n FROM account_notifications WHERE booking_id=$1 AND kind='session_changed'", [b.id])).rows[0].n).toBe(1);
    expect((await client.query("SELECT count(*)::int n FROM cancellation_fees")).rows[0].n).toBe(0);
    await migrate();
    expect((await client.query("SELECT count(*)::int n FROM account_notifications WHERE booking_id=$1", [b.id])).rows[0].n).toBe(1);
  });

  it("rolls back the whole change on a Wednesday conflict", async () => {
    const id = await session();
    const conflict = (await client.query("SELECT (($1::timestamptz AT TIME ZONE 'Europe/Prague')-interval '1 day') AT TIME ZONE 'Europe/Prague' AS start", [oldStart])).rows[0].start;
    await session(conflict.toISOString(), nicola, "trx");
    await expect(migrate()).rejects.toThrow("conflicts");
    expect(local((await client.query("SELECT start_at FROM class_sessions WHERE id=$1", [id])).rows[0].start_at)).toBe("Thu 08:30");
  });

  it("serializes the migration with the session lock used when booking", async () => {
    const id = await session();
    const writer = new Client({ connectionString: databaseUrl }); await writer.connect();
    try {
      await writer.query(`SET search_path TO "${schema}", public`);
      await writer.query("SET lock_timeout='150ms'");
      await client.query("BEGIN"); await client.query(movedSql);
      await expect(writer.query("SELECT id FROM class_sessions WHERE id=$1 FOR UPDATE", [id])).rejects.toMatchObject({ code: "55P03" });
      await client.query("COMMIT");
      const result = await writer.query("SELECT start_at FROM class_sessions WHERE id=$1 FOR UPDATE", [id]);
      expect(local(result.rows[0].start_at)).toBe("Wed 08:30");
    } finally { await writer.end(); }
  });

  it("preserves history, cancellations, individual exceptions and Tuesday Barre Sculpt", async () => {
    const historic = await session("2026-09-03 08:30 Europe/Prague");
    const exception = await session(oldStart,katka,"barre-strength","Individuální změna");
    const cancelled = await session(oldStart,nicola); await client.query("UPDATE class_sessions SET status='cancelled' WHERE id=$1",[cancelled]);
    const tuesday = (await client.query("SELECT (($1::timestamptz AT TIME ZONE 'Europe/Prague')-interval '2 days') AT TIME ZONE 'Europe/Prague' AS start", [oldStart])).rows[0].start;
    const sculpt = await session(tuesday.toISOString(),nicola,"barre");
    await migrate();
    const rows = (await client.query("SELECT id,start_at,status,change_notice FROM class_sessions WHERE id=ANY($1::uuid[])", [[historic,exception,cancelled,sculpt]])).rows;
    expect(rows).toHaveLength(4); expect(rows.filter((r) => r.id!==sculpt).every((r) => local(r.start_at)==="Thu 08:30")).toBe(true);
    expect(local(rows.find((r) => r.id===sculpt).start_at)).toBe("Tue 08:30");
    expect(rows.find((r) => r.id===cancelled).status).toBe("cancelled");
  });

  it("keeps 08:30 Prague across winter and summer offsets", async () => {
    const winter = await session();
    const summerStart = (await client.query("SELECT (($1::timestamptz AT TIME ZONE 'Europe/Prague')+interval '7 days') AT TIME ZONE 'Europe/Prague' AS start", [oldStart])).rows[0].start;
    const summer = await session(summerStart.toISOString()); await migrate();
    const rows = (await client.query("SELECT start_at FROM class_sessions WHERE id=ANY($1::uuid[]) ORDER BY start_at", [[winter,summer]])).rows;
    expect(rows.map((r) => local(r.start_at))).toEqual(["Wed 08:30","Wed 08:30"]);
    expect(rows.map((r) => r.start_at.getUTCHours())).toEqual([7,6]);
  });

  it("provides both Jumping instructors with no future sessions and follows a session substitution", async () => {
    await client.query("DELETE FROM class_sessions WHERE start_at>now()");
    const service = new ScheduleService({ query: client.query.bind(client) } as unknown as DatabaseService);
    const lesson = await service.getClassType("jumping");
    expect(lesson?.upcomingSessions).toEqual([]);
    expect(lesson?.instructors.map((i) => [i.id,i.scheduleNote,i.portrait?.src])).toEqual([
      [nicola,"Středa","/images/studio-balance/team/nicola-lojskova.webp"],
      [monika,"Neděle","/images/studio-balance/team/monika-kubincova.webp"]
    ]);
    const id = await session(oldStart,nicola,"jumping");
    expect((await service.getSession(id))?.instructor.portrait?.src).toContain("nicola-lojskova");
    await client.query("UPDATE class_sessions SET instructor_id=$2 WHERE id=$1", [id,monika]);
    expect((await service.getSession(id))?.instructor.portrait?.src).toContain("monika-kubincova");
    await client.query("UPDATE instructors SET portrait_preview_path='' WHERE id=$1", [monika]);
    expect((await service.getSession(id))?.instructor).toEqual({ id: monika, displayName: "Monika Kubincová", portrait: null });
  });

  it("edits portraits and catalogue assignments centrally without accepting transformation assets", async () => {
    const database = {
      query: client.query.bind(client),
      transaction: async (work: (db: Client) => Promise<unknown>) => {
        await client.query("BEGIN");
        try { const result = await work(client); await client.query("COMMIT"); return result; }
        catch (error) { await client.query("ROLLBACK"); throw error; }
      }
    } as unknown as DatabaseService;
    const admin = new AdminService(database);
    const context = { requestId: "test", session: { subject: "operator" } as StudioSession };
    const types = (await client.query("SELECT id FROM class_types WHERE slug='jumping'")).rows;
    const asset = (await client.query(`INSERT INTO media_assets (storage_key,content_type,width,height,size_bytes,created_by)
      VALUES ('studio/test.webp','image/webp',200,300,100,'test') RETURNING id`)).rows[0].id;
    const data = { displayName: "Monika Kubincová",bio: "Lektorka Jumpingu",active: true,sortOrder: 70,
      portraitAssetId: asset,classes: [{ classTypeId: types[0].id,scheduleNote: "Neděle" }] };
    await admin.updateInstructor(monika,data,context);
    expect((await admin.listInstructors()).items.find((p) => p.id===monika)?.portrait?.src).toBe(`/api/v1/admin/media/${asset}`);
    const schedule = new ScheduleService(database);
    expect((await schedule.getClassType("jumping"))?.instructors.find((p) => p.id===monika)?.portrait?.src).toBe(`/api/v1/media/${asset}`);
    await client.query("UPDATE media_assets SET storage_key='transformations/private.webp' WHERE id=$1", [asset]);
    await expect(admin.updateInstructor(monika,data,context)).rejects.toThrow("Vyberte fotografii");
    await admin.updateInstructor(monika,{ ...data,portraitAssetId: null },context);
    expect((await admin.listInstructors()).items.find((p) => p.id===monika)?.portrait).toBeNull();
  });
});

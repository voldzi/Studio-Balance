import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client, Pool, type PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountService } from "../account/account.service.js";
import { AdminService } from "../admin/admin.service.js";
import type { StudioSession } from "../auth/session.js";
import type { DatabaseService } from "../database/database.service.js";
import { BookingService, CURRENT_TERMS_VERSION } from "../booking/booking.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);

describe.skipIf(!databaseUrl)("administrator cancellation (isolated local PostgreSQL)", () => {
  let client: Client;
  let pool: Pool;
  let schema: string;
  let bookings: BookingService;
  let admin: AdminService;
  let owner: StudioSession;
  let other: StudioSession;
  let sessionId: string;
  let startAt: Date;
  const context = { requestId: "companion-admin", session: { subject: "admin",roles:["admin"],mfaVerified:true } as StudioSession };

  beforeEach(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Local database only");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    schema = `admin_cancel_test_${randomUUID().replaceAll("-", "")}`;
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

  const data = {scope:"one" as const,feePolicy:"standard" as const,reason:"Klient požádal o odhlášení."};
  async function preview(id:string, patch:Partial<Parameters<AdminService["previewBookingCancellation"]>[1]>={}) {return admin.previewBookingCancellation(id,{...data,...patch},context);}
  async function apply(id:string, patch:Partial<Parameters<AdminService["cancelBooking"]>[1]>={}) {
    const p=await preview(id,patch);return admin.cancelBooking(id,{...data,...patch,previewToken:p.previewToken,idempotencyKey:randomUUID()},context);
  }
  async function fees() {return (await client.query("SELECT booking_id,amount_cents,status FROM cancellation_fees ORDER BY booking_id")).rows;}
  async function timing(start:string,now:string) {
    await client.query("UPDATE class_sessions SET start_at=$2,end_at=$2::timestamptz+interval '1 hour' WHERE id=$1",[sessionId,start]);
    await client.query("UPDATE bookings SET cancellation_cutoff_at=$2::timestamptz-interval '24 hours' WHERE session_id=$1",[sessionId,start]);
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date(now));
  }
  it("releases just one named seat and leaves the companion and history intact",async()=>{
    const b=await bookings.create(input());const p=await preview(b.id);
    expect(p.hasOtherParticipant).toBe(true);expect(p.items).toHaveLength(1);expect(p.items[0]?.participantKind).toBe("self");
    expect(await apply(b.id)).toEqual({cancelledBookings:1,releasedPlaces:1,totalFeeCents:0});
    expect(await count()).toBe(1);expect(await fees()).toEqual([]);
    expect((await client.query("SELECT status FROM bookings WHERE id=$1",[b.id])).rows[0].status).toBe("cancelled_on_time");
    expect((await bookings.listMine(owner)).items.map(b=>b.id)).toContain(b.id);
    expect((await client.query("SELECT * FROM notification_outbox WHERE booking_id=$1 AND status='pending'",[b.id])).rowCount).toBe(0);
    expect((await client.query("SELECT * FROM account_notifications WHERE booking_id=$1 AND kind='booking_cancelled'",[b.id])).rowCount).toBe(1);
    expect((await client.query("SELECT * FROM notification_outbox WHERE booking_id=$1 AND status='pending'",[b.companionBooking!.id])).rowCount).toBeGreaterThan(0);
  });
  it("can cancel only a companion or explicitly both seats without touching another owner",async()=>{
    const a=await bookings.create(input());const b=await bookings.create(input(other));
    await apply(a.companionBooking!.id);expect(await count()).toBe(3);
    const p=await preview(b.companionBooking!.id,{scope:"both"});expect(p.items).toHaveLength(2);
    await apply(b.id,{scope:"both"});expect(await count()).toBe(1);
  });
  it("replays simultaneous duplicate requests once and rejects key reuse with different input",async()=>{
    const b=await bookings.create(input());const p=await preview(b.id);const request={...data,previewToken:p.previewToken,idempotencyKey:randomUUID()};
    const result=await Promise.all([admin.cancelBooking(b.id,request,context),admin.cancelBooking(b.id,request,context)]);
    expect(result[0]).toEqual(result[1]);expect(await count()).toBe(1);
    expect((await client.query("SELECT * FROM application_audit WHERE action='booking.cancelled_by_admin'")).rowCount).toBe(1);
    await expect(admin.cancelBooking(b.id,{...request,reason:"Jiný důvod"},context)).rejects.toMatchObject({status:409});
  });
  it("serializes two administrators and does not duplicate fees or notifications",async()=>{
    const b=await bookings.create(input());await timing("2027-03-28T08:00:00+02:00","2027-03-28T07:00:00+02:00");
    const p=await preview(b.id);const request={...data,previewToken:p.previewToken,idempotencyKey:randomUUID()};
    const results=await Promise.allSettled([admin.cancelBooking(b.id,request,context),admin.cancelBooking(b.id,{...request,idempotencyKey:randomUUID()},context)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(await fees()).toHaveLength(1);
  });
  it.each([ ["2027-03-28T08:00:00+02:00","2027-03-27T07:00:00+01:00",0],
    ["2027-03-28T08:00:00+02:00","2027-03-27T07:00:00.001+01:00",27000],
    ["2026-10-25T08:00:00+01:00","2026-10-24T09:00:00+02:00",0],
    ["2026-10-25T08:00:00+01:00","2026-10-24T09:00:00.001+02:00",27000] ])("honors exact 24h instants across DST: %s %s",async(start,now,fee)=>{
      const b=await bookings.create(input());await timing(start,now);expect((await preview(b.id)).totalFeeCents).toBe(fee);
      expect((await apply(b.id)).totalFeeCents).toBe(fee);expect(await fees()).toHaveLength(fee?1:0);
    });
  it("preserves the free-change window and snapshots two late fees or their explicit waiver",async()=>{
    const b=await bookings.create(input());await timing("2027-03-28T08:00:00+02:00","2027-03-28T07:00:00+02:00");
    expect((await preview(b.id,{scope:"both"})).totalFeeCents).toBe(54000);
    await apply(b.id,{scope:"both",feePolicy:"waive",waiverReason:"Individuální výjimka studia."});
    expect((await fees()).map(f=>({amount:f.amount_cents,status:f.status}))).toEqual([{amount:27000,status:"waived"},{amount:27000,status:"waived"}]);
    expect((await client.query("SELECT metadata FROM application_audit WHERE action='booking.cancelled_by_admin'")).rows.every(r=>r.metadata.waiverReason)).toBe(true);
  });
  it("offers no fee during the inclusive free change window",async()=>{
    const b=await bookings.create(input());await timing("2027-03-28T08:00:00+02:00","2027-03-28T07:00:00+02:00");
    await client.query("UPDATE class_sessions SET free_cancellation_until=$2 WHERE id=$1",[sessionId,new Date()]);
    expect((await preview(b.id)).items[0]?.mode).toBe("free_change_window");await apply(b.id);expect(await fees()).toHaveLength(0);
  });
  it("rejects a stale preview when price or cutoff changes without releasing places",async()=>{
    const b=await bookings.create(input());const p=await preview(b.id);
    await client.query("UPDATE bookings SET price_snapshot_cents=16000,updated_at=now() WHERE id=$1",[b.id]);
    await expect(admin.cancelBooking(b.id,{...data,previewToken:p.previewToken,idempotencyKey:randomUUID()},context)).rejects.toMatchObject({status:409});expect(await count()).toBe(2);
  });
  it("requires a new preview after crossing the late boundary",async()=>{
    const b=await bookings.create(input());await timing("2027-03-28T08:00:00+02:00","2027-03-27T07:00:00+01:00");const p=await preview(b.id);
    vi.setSystemTime(new Date(Date.now()+1));
    await expect(admin.cancelBooking(b.id,{...data,previewToken:p.previewToken,idempotencyKey:randomUUID()},context)).rejects.toMatchObject({status:409});expect(await count()).toBe(2);
  });
  it("refuses future attendance, cancelled sessions and an existing financial record without damage",async()=>{
    const b=await bookings.create(input());await client.query("UPDATE bookings SET status='attended' WHERE id=$1",[b.id]);
    await expect(preview(b.id)).rejects.toMatchObject({status:409});
    await client.query("UPDATE bookings SET status='reserved' WHERE id=$1",[b.id]);await client.query("UPDATE class_sessions SET status='cancelled' WHERE id=$1",[sessionId]);
    await expect(preview(b.id)).rejects.toMatchObject({status:409});
    await client.query("UPDATE class_sessions SET status='scheduled' WHERE id=$1",[sessionId]);
    await client.query("INSERT INTO cancellation_fees (booking_id,user_id,amount_cents,status) SELECT id,user_id,27000,'waived' FROM bookings WHERE id=$1",[b.id]);
    await expect(preview(b.id)).rejects.toMatchObject({status:409});expect(await count()).toBe(2);
  });
  it("rejects at the lesson start and cannot cancel another owner through scope=both",async()=>{
    const a=await bookings.create(input());const b=await bookings.create(input(other));await apply(a.id,{scope:"both"});expect(await count()).toBe(2);
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(startAt);
    await expect(preview(b.id)).rejects.toMatchObject({status:409});
  });
  it("requires administrator role and MFA even for a direct service call",async()=>{
    const b=await bookings.create(input());
    await expect(admin.previewBookingCancellation(b.id,data,{...context,session:owner})).rejects.toMatchObject({status:403});
    await expect(admin.previewBookingCancellation(b.id,data,{...context,session:{...context.session,mfaVerified:false}})).rejects.toMatchObject({status:403});
  });
  it("releases capacity so a concurrent new booking can succeed without overbooking",async()=>{
    const b=await bookings.create(input());await client.query("UPDATE class_sessions SET capacity=2 WHERE id=$1",[sessionId]);
    const p=await preview(b.id);const [cancelled,created]=await Promise.allSettled([admin.cancelBooking(b.id,{...data,previewToken:p.previewToken,idempotencyKey:randomUUID()},context),bookings.create({...input(other),companionName:undefined,companionResponsibilityAccepted:undefined})]);
    expect(cancelled.status).toBe("fulfilled");expect(await count()).toBeLessThanOrEqual(2);
    if(created.status==="rejected") await bookings.create({...input(other),companionName:undefined,companionResponsibilityAccepted:undefined});
    expect(await count()).toBe(2);
  });
  it("never applies an old retry to replacement reservations",async()=>{
    const b=await bookings.create(input());const p=await preview(b.id,{scope:"both"});
    const request={...data,scope:"both" as const,previewToken:p.previewToken,idempotencyKey:randomUUID()};
    const original=await admin.cancelBooking(b.id,request,context);
    const replacement=await bookings.create(input());expect(replacement.id).not.toBe(b.id);
    expect(await admin.cancelBooking(b.id,request,context)).toEqual(original);expect(await count()).toBe(2);
  });
  it("rolls back seats, fees, notices and receipts together when audit fails",async()=>{
    const b=await bookings.create(input());await timing("2027-03-28T08:00:00+02:00","2027-03-28T07:00:00+02:00");
    await client.query("ALTER TABLE application_audit ADD CONSTRAINT cancellation_audit_test CHECK (action<>'booking.cancelled_by_admin')");
    await expect(apply(b.id,{scope:"both"})).rejects.toThrow();expect(await count()).toBe(2);expect(await fees()).toHaveLength(0);
    expect((await client.query("SELECT * FROM account_notifications WHERE kind='booking_cancelled'")).rowCount).toBe(0);
    expect((await client.query("SELECT * FROM admin_booking_cancellation_receipts")).rowCount).toBe(0);
  });

});

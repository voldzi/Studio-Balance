import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import { cancellationMode } from "@studiobalance/domain";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../database/database.service.js";
import type { MutationContext } from "./admin.service.js";

export type AdminCancellationInput = { scope: "one" | "both"; feePolicy: "standard" | "waive"; reason: string; waiverReason?: string | undefined };
export type AdminCancellationApply = AdminCancellationInput & { previewToken: string; idempotencyKey: string };
type Row = { id: string; user_id: string; status: string; participant_kind: string; participant_name: string | null; price_snapshot_cents: number; cancellation_cutoff_at: Date; updated_at: Date; first_name: string | null; last_name: string | null; email: string; fee_status: string | null };
function conflict(message: string): never { throw new HttpException({ code: "STATE_CONFLICT", message }, HttpStatus.CONFLICT); }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function requireAdmin(context: MutationContext) {
  if (!context.session.mfaVerified || !context.session.roles?.some((r) => r === "admin" || r === "super_admin")) {
    throw new HttpException({ code: "PERMISSION_DENIED", message: "Odhlášení vyžaduje ověřené přihlášení správce." }, HttpStatus.FORBIDDEN);
  }
}
async function plan(client: PoolClient, bookingId: string, input: AdminCancellationInput, lock: boolean) {
  const anchor = (await client.query<{session_id:string;user_id:string}>("SELECT session_id,user_id FROM bookings WHERE id=$1", [bookingId])).rows[0];
  if (!anchor) throw new HttpException({code:"RESOURCE_NOT_FOUND",message:"Rezervace nebyla nalezena."},HttpStatus.NOT_FOUND);
  // Booking creation locks the owner before the session. Keep the same order.
  if (lock) await client.query("SELECT id FROM user_profiles WHERE id=$1 FOR UPDATE", [anchor.user_id]);
  const session = (await client.query<{ id:string;start_at:Date;status:string;free_cancellation_until:Date|null;updated_at:Date;class_name:string }>(`SELECT s.id,s.start_at,s.status,s.free_cancellation_until,s.updated_at,ct.name AS class_name
    FROM class_sessions s JOIN class_types ct ON ct.id=s.class_type_id WHERE s.id=$1 ${lock ? "FOR UPDATE OF s" : ""}`, [anchor.session_id])).rows[0]!;
  const now = new Date();
  if (session.status !== "scheduled" || now >= session.start_at) conflict("Odhlásit lze pouze rezervaci před začátkem naplánované lekce. Po začátku použijte docházku.");
  const rows = (await client.query<Row>(`SELECT b.*,u.first_name,u.last_name,u.email,
    (SELECT f.status FROM cancellation_fees f WHERE f.booking_id=b.id) AS fee_status
    FROM bookings b JOIN user_profiles u ON u.id=b.user_id WHERE b.user_id=$1 AND b.session_id=$2
    AND (b.status='reserved' OR b.id=$3) ORDER BY b.id ${lock ? "FOR UPDATE OF b" : ""}`, [anchor.user_id,anchor.session_id,bookingId])).rows;
  const target = rows.find((b) => b.id === bookingId);
  if (!target || target.status !== "reserved") conflict("Rezervace už není aktivní. Obnovte přehled; žádnou další osobu jsme neodhlásili.");
  const active = rows.filter((b) => b.status === "reserved");
  if (input.scope === "both" && active.length !== 2) conflict("Rezervace klienta a doprovodu se změnily. Zkontrolujte nový náhled.");
  const selected = input.scope === "both" ? active : [target];
  if (selected.some((b) => b.fee_status !== null)) conflict("Rezervace má již finanční záznam. Nejprve jej prověřte v přehledu poplatků.");
  if (await client.query("SELECT 1 FROM instructor_lesson_records WHERE session_id=$1", [session.id]).then((r) => r.rowCount)) conflict("Lekce již má potvrzený výkaz odučení.");
  const items = selected.map((b) => {
    const mode = cancellationMode({cutoffAt:b.cancellation_cutoff_at,freeCancellationUntil:session.free_cancellation_until,now});
    const feeCents = mode === "late" ? b.price_snapshot_cents : 0;
    return { id:b.id, name:b.participant_kind === "companion" ? b.participant_name! : [b.first_name,b.last_name].filter(Boolean).join(" ") || b.email,
      participantKind:b.participant_kind as "self" | "companion", mode, feeCents, payableCents:input.feePolicy === "waive" ? 0 : feeCents };
  });
  const preview = {sessionId:session.id,className:session.class_name,startAt:session.start_at.toISOString(),hasOtherParticipant:active.length === 2,items,
    totalFeeCents:items.reduce((n,b) => n+b.payableCents,0),releasedPlaces:items.length,
    previewToken:hash({bookingId,input,session,selected,items})};
  return {preview,selected,session};
}
export async function previewAdminCancellation(database: DatabaseService, bookingId: string, input: AdminCancellationInput, context: MutationContext) {
  requireAdmin(context);
  return database.transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    return (await plan(client,bookingId,input,false)).preview;
  });
}
export async function applyAdminCancellation(database: DatabaseService, bookingId: string, input: AdminCancellationApply, context: MutationContext) {
  requireAdmin(context);
  const {previewToken,idempotencyKey,...data} = input;
  const requestHash=hash({bookingId,...input});
  return database.transaction(async (client) => {
    await client.query("LOCK TABLE class_sessions, bookings, cancellation_fees IN ROW EXCLUSIVE MODE");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`admin-booking-cancel:${context.session.subject}:${idempotencyKey}`]);
    const replay = (await client.query<{request_hash:string;response_body:{cancelledBookings:number;releasedPlaces:number;totalFeeCents:number}}>(
      "SELECT request_hash,response_body FROM admin_booking_cancellation_receipts WHERE actor_id=$1 AND idempotency_key=$2", [context.session.subject,idempotencyKey])).rows[0];
    if (replay) {
      if (replay.request_hash !== requestHash) conflict("Opakovací klíč již patří jiné změně. Zkontrolujte výsledek předchozího odhlášení.");
      return replay.response_body;
    }
    const {preview,selected,session} = await plan(client,bookingId,data,true);
    if (preview.previewToken !== previewToken) conflict("Rezervace, cena nebo storno podmínky se změnily. Načtěte nový náhled a potvrďte jej znovu.");
    for (const item of preview.items) {
      const row=selected.find((b)=>b.id===item.id)!;
      const status=item.mode === "late" ? "cancelled_late" : "cancelled_on_time";
      await client.query("UPDATE bookings SET status=$2,cancelled_at=now(),updated_at=now() WHERE id=$1", [item.id,status]);
      if (item.mode === "late") {
        await client.query(`INSERT INTO cancellation_fees (booking_id,user_id,amount_cents,status)
          VALUES ($1,$2,$3,$4)`, [item.id,row.user_id,item.feeCents,data.feePolicy === "waive" ? "waived" : "due"]);
      }
      await client.query(`INSERT INTO account_notifications (user_id,booking_id,kind,title,body)
        VALUES ($1,$2,'booking_cancelled','Studio vás odhlásilo z lekce',$3)`, [row.user_id,item.id,
        `${session.class_name} · ${item.participantKind === "companion" ? "Doprovod" : "Vaše místo"}: ${data.reason} ${item.payableCents ? `Storno poplatek ${item.payableCents/100} Kč uhradíte ve studiu.` : "Bez storno poplatku k úhradě."}`]);
      await client.query("UPDATE notification_outbox SET status='cancelled',updated_at=now() WHERE booking_id=$1 AND status IN ('pending','failed')", [item.id]);
      await client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id,metadata)
        VALUES ('admin',$1,'booking.cancelled_by_admin','booking',$2,$3,$4)`, [context.session.subject,item.id,context.requestId,
        {reason:data.reason,waiverReason:data.waiverReason??null,feePolicy:data.feePolicy,mode:item.mode,feeCents:item.feeCents,scope:data.scope,sessionId:session.id}]);
    }
    const result={cancelledBookings:preview.items.length,releasedPlaces:preview.items.length,totalFeeCents:preview.totalFeeCents};
    await client.query("INSERT INTO admin_booking_cancellation_receipts (actor_id,idempotency_key,request_hash,response_body) VALUES ($1,$2,$3,$4)", [context.session.subject,idempotencyKey,requestHash,result]);
    return result;
  });
}

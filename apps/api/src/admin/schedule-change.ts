import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { AdminService, MutationContext } from "./admin.service.js";

export type ScheduleChangeInput = {
  ruleIds: string[]; from: string; through?: string | undefined; operation: "edit" | "close" | "cancel" | "open";
  classTypeId?: string | undefined; instructorId?: string | undefined; weekday?: number | undefined; localStartTime?: string | undefined;
  durationMinutes?: number | undefined; capacity?: number | undefined; priceCents?: number | undefined; bookingLeadDays?: number | undefined;
  reopenCancelled: boolean; updateBookedPrices: boolean; reason: string; previewToken?: string | undefined;
};
type Rule = {
  id: string; class_type_id: string; instructor_id: string; weekday: number; local_start_time: string;
  duration_minutes: number; arrival_lead_minutes: number; location_name: string; location_address: string;
  price_cents: number; capacity: number; booking_lead_days: number; equipment: string; suitability: string;
  generate_from: string; generate_until: string | null; predecessor_id: string | null;
  active: boolean; booking_paused: boolean; session_cancelled: boolean; class_name: string;
};
type Term = {
  id: string; class_type_id: string; instructor_id: string; start_at: Date; end_at: Date;
  local_date: string; weekday: number; local_time: string; status: string; booking_paused: boolean;
  capacity: number; price_cents: number; weekly_rule_id: string | null; weekly_occurrence_date: string | null;
  arrival_lead_minutes: number; location_name: string; location_address: string; equipment: string; suitability: string;
  bookings: { id: string; userId: string; price: number; fee: boolean }[]; updated_at: Date;
};
const fail = (message: string) => new HttpException({ code: "BOOKING_STATE_CONFLICT", message }, HttpStatus.CONFLICT);
const dayAfter = (date: string, offset: number) => new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0,10);

export async function scheduleChange(client: PoolClient, input: ScheduleChangeInput, context: MutationContext | undefined, admin: AdminService) {
  const today = (await client.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Prague')::date::text AS today")).rows[0]!.today;
  if (input.from < today || (input.through && input.through < input.from)) throw fail("Vyberte dnešní nebo budoucí datum a správný konec období.");
  if (new Set(input.ruleIds).size !== input.ruleIds.length) throw fail("Pravidelný čas vyberte pouze jednou.");
  if (input.ruleIds.length > 1 && (input.weekday !== undefined || input.localStartTime !== undefined)) throw fail("Den a čas upravujte u jednoho pravidelného času. Ostatní společné změny lze provést najednou.");
  const rules = (await client.query<Rule>(`SELECT r.*,r.generate_from::text,r.generate_until::text,t.name AS class_name
    FROM weekly_schedule_rules r JOIN class_types t ON t.id=r.class_type_id WHERE r.id=ANY($1::uuid[]) ORDER BY r.id`, [input.ruleIds])).rows;
  if (rules.length !== input.ruleIds.length) throw fail("Některá pravidelná lekce už není dostupná. Obnovte rozvrh.");
  const catalogue = (await client.query<{ id: string; name: string; default_equipment: string; audience: string; practical_notice: string }>("SELECT id,name,default_equipment,audience,practical_notice FROM class_types WHERE active=true")).rows;
  const instructors = (await client.query<{ id: string }>("SELECT id FROM instructors WHERE active=true")).rows;
  const plans: { rule: Rule; next: Rule; from: string; through: string | null; terms: Term[]; exceptions: Term[]; after: Term[]; changes: { term: Term; start: Date; end: Date; date: string }[] }[] = [];
  for (const rule of rules) {
    const from = rule.predecessor_id && input.from < rule.generate_from ? rule.generate_from : input.from;
    const through = [input.through,rule.generate_until].filter((d): d is string => Boolean(d)).sort()[0] ?? null;
    if (through && through < from) continue;
    const next: Rule = { ...rule,
      class_type_id: input.classTypeId ?? rule.class_type_id, instructor_id: input.instructorId ?? rule.instructor_id,
      weekday: input.weekday ?? rule.weekday, local_start_time: input.localStartTime ?? rule.local_start_time,
      duration_minutes: input.durationMinutes ?? rule.duration_minutes, capacity: input.capacity ?? rule.capacity,
      price_cents: input.priceCents ?? rule.price_cents, booking_lead_days: input.bookingLeadDays ?? rule.booking_lead_days,
      booking_paused: input.operation === "close" ? true : input.operation === "open" ? false : rule.booking_paused,
      session_cancelled: input.operation === "cancel" ? true : input.operation === "open" || input.reopenCancelled ? false : rule.session_cancelled,
      active: input.operation === "open" || input.reopenCancelled ? true : rule.active
    };
    const type = catalogue.find((t) => t.id === next.class_type_id);
    if (!type || !instructors.some((i) => i.id === next.instructor_id)) throw fail("Vyberte aktivní lekci a instruktora.");
    next.class_name = type.name;
    if (next.class_type_id !== rule.class_type_id) {
      next.equipment = type.default_equipment; next.suitability = [type.audience,type.practical_notice].filter(Boolean).join(" ");
    }
    // Include manual opening terms as well as generated terms, but retain individually moved exceptions.
    const candidates = (await client.query<Term>(`SELECT s.*, (s.start_at AT TIME ZONE 'Europe/Prague')::date::text AS local_date,
      extract(isodow FROM s.start_at AT TIME ZONE 'Europe/Prague')::int AS weekday,
      (s.start_at AT TIME ZONE 'Europe/Prague')::time::text AS local_time,s.weekly_occurrence_date::text,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'userId',b.user_id,'price',b.price_snapshot_cents,
        'fee',EXISTS(SELECT 1 FROM cancellation_fees f WHERE f.booking_id=b.id AND f.status IN ('due','settled'))) ORDER BY b.id)
        FROM bookings b WHERE b.session_id=s.id AND b.status='reserved'),'[]'::jsonb) AS bookings
      FROM class_sessions s WHERE s.start_at>now() AND s.status IN ('scheduled','cancelled')
      AND (s.weekly_rule_id=$1 OR (s.weekly_rule_id IS NULL AND s.class_type_id=$2
        AND extract(isodow FROM s.start_at AT TIME ZONE 'Europe/Prague')=$3
        AND (s.start_at AT TIME ZONE 'Europe/Prague')::time=$4::time))
      AND (s.start_at AT TIME ZONE 'Europe/Prague')::date >= $5::date ORDER BY s.start_at,s.id`,
      [rule.id,rule.class_type_id,rule.weekday,rule.local_start_time,from])).rows;
    const after = candidates.filter((s) => through && s.local_date > through);
    const within = candidates.filter((s) => !through || s.local_date <= through);
    const exceptions = within.filter((s) => s.class_type_id !== rule.class_type_id || s.weekday !== rule.weekday || s.local_time.slice(0,5) !== rule.local_start_time.slice(0,5));
    const terms = within.filter((s) => !exceptions.includes(s));
    const changes = [];
    for (const term of terms) {
      if (term.status === "cancelled" && !input.reopenCancelled) continue;
      if (input.operation === "cancel") continue;
      if (term.bookings.length > next.capacity) throw fail(`Termín ${term.local_date} má ${term.bookings.length} přihlášených; kapacita ${next.capacity} nestačí.`);
      if (input.updateBookedPrices && term.bookings.some((b) => b.fee && b.price !== next.price_cents)) throw fail("Rezervaci s aktivním nebo uhrazeným poplatkem nelze přecenit.");
      const date = dayAfter(term.local_date, next.weekday - rule.weekday);
      if (date < from || (through && date > through)) throw fail("Přesun by překročil vybrané období. Posuňte datum účinnosti nebo upravte nejbližší termín samostatně.");
      const start = (await client.query<{ start: Date }>("SELECT (($1::date + $2::time) AT TIME ZONE 'Europe/Prague') AS start",[date,next.local_start_time])).rows[0]!.start;
      if (start <= new Date()) throw fail("Nový čas by byl v minulosti.");
      changes.push({ term,start,end: new Date(start.getTime()+next.duration_minutes*60000),date });
    }
    if (next.active && !next.session_cancelled) {
      const collision = await client.query(`SELECT id FROM weekly_schedule_rules WHERE id<>ALL($1::uuid[]) AND active=true AND session_cancelled=false
        AND weekday=$2 AND (instructor_id=$3 OR (location_name=$4 AND location_address=$5))
        AND (generate_until IS NULL OR generate_until >= $6::date) AND ($7::date IS NULL OR generate_from <= $7::date)
        AND local_start_time < $8::time + make_interval(mins=>$9)
        AND local_start_time + make_interval(mins=>duration_minutes) > $8::time LIMIT 1`,
        [input.ruleIds,next.weekday,next.instructor_id,next.location_name,next.location_address,from,through,next.local_start_time,next.duration_minutes]);
      if (collision.rowCount) throw fail("Pravidelný čas koliduje s jinou lekcí nebo instruktorem.");
    }
    const duplicateClass = await client.query(`SELECT id FROM weekly_schedule_rules WHERE id<>ALL($1::uuid[]) AND class_type_id=$2 AND weekday=$3
      AND (generate_until IS NULL OR generate_until >= $4::date) AND ($5::date IS NULL OR generate_from <= $5::date) LIMIT 1`,
      [input.ruleIds,next.class_type_id,next.weekday,from,through]);
    if(duplicateClass.rowCount) throw fail("Tato lekce už má pravidelný termín ve zvolený den a období.");
    plans.push({rule,next,from,through,terms,exceptions,after,changes});
  }
  if (!plans.length) throw fail("Vybrané pravidelné časy už v tomto období neplatí. Vyberte jejich navazující verzi.");
  for(const plan of plans) for(const other of plans) {
    if(plan===other || plan.next.weekday!==other.next.weekday || (plan.through && plan.through<other.from) || (other.through && other.through<plan.from))continue;
    const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
    const overlap=minutes(plan.next.local_start_time)<minutes(other.next.local_start_time)+other.next.duration_minutes
      && minutes(other.next.local_start_time)<minutes(plan.next.local_start_time)+plan.next.duration_minutes;
    if(plan.next.class_type_id===other.next.class_type_id || (overlap && plan.next.active && other.next.active && !plan.next.session_cancelled && !other.next.session_cancelled))
      throw fail("Vybrané pravidelné časy by ve stejném období vytvořily duplicitní nebo překrývající se lekce.");
  }
  const changes = plans.flatMap((p) => p.changes);
  const allIds = changes.map((c) => c.term.id);
  for (const plan of plans) for (const change of plan.changes) {
    const collision = await client.query(`SELECT id FROM class_sessions WHERE id<>ALL($1::uuid[]) AND status='scheduled'
      AND start_at<$3 AND end_at>$2 AND (instructor_id=$4 OR (location_name=$5 AND location_address=$6)) LIMIT 1`,
      [allIds,change.start,change.end,plan.next.instructor_id,change.term.location_name,change.term.location_address]);
    if (collision.rowCount || changes.some((other) => other !== change && other.start < change.end && other.end > change.start)) throw fail("Upravený termín koliduje s jinou lekcí.");
  }
  const { previewToken: ignored, ...reviewedInput } = input; void ignored;
  const previewToken = createHash("sha256").update(JSON.stringify({input:reviewedInput,plans})).digest("hex");
  const summary = {
    slots: plans.map((p)=>({from:p.from,through:p.through,before:{name:p.rule.class_name,weekday:p.rule.weekday,time:p.rule.local_start_time.slice(0,5),capacity:p.rule.capacity,priceCents:p.rule.price_cents},
      after:{name:p.next.class_name,weekday:p.next.weekday,time:p.next.local_start_time.slice(0,5),capacity:p.next.capacity,priceCents:p.next.price_cents}})),
    previewToken, rulesChanged: plans.length, sessionsChanged: plans.reduce((n,p) => n + (input.operation === "cancel" ? p.terms.filter((t) => t.status==='scheduled').length : p.changes.length),0),
    activeBookings: plans.reduce((n,p) => n+p.terms.reduce((m,t) => m+t.bookings.length,0),0),
    cancelledSessionsKept: plans.reduce((n,p) => n+p.terms.filter((t) => t.status==='cancelled' && !input.reopenCancelled).length,0),
    exceptions: plans.flatMap((p) => p.exceptions.map((t) => ({id:t.id,startAt:t.start_at.toISOString()}))),
    terms: plans.flatMap((p) => p.terms.map((t) => ({ id:t.id,startAt:t.start_at.toISOString(),newStartAt:p.changes.find((c)=>c.term.id===t.id)?.start.toISOString() ?? t.start_at.toISOString(),status:t.status,bookings:t.bookings.length,
      before:p.rule.class_name,after:p.next.class_name,capacity:p.next.capacity,priceCents:p.next.price_cents,
      changed:input.operation==='cancel' ? t.status==='scheduled' : t.status!=='cancelled' || input.reopenCancelled })))
  };
  if (!context) return summary;
  if (input.previewToken !== previewToken) throw fail("Rozvrh nebo rezervace se změnily. Zkontrolujte dopad znovu.");
  for (const plan of plans) {
    const {rule,next,from,through} = plan;
    await client.query("UPDATE weekly_schedule_rules SET generate_until=$2::date-1,updated_at=now() WHERE id=$1",[rule.id,from]);
    const nextId = await cloneRule(client,next,rule.id,from,through);
    let tailId: string | undefined;
    if (through && (!rule.generate_until || through < rule.generate_until)) tailId = await cloneRule(client,rule,rule.id,dayAfter(through,1),rule.generate_until);
    if (tailId) for (const term of plan.after) await linkTerm(client,term,tailId);
    for (const term of [...plan.terms,...plan.exceptions]) await linkTerm(client,term,nextId);
    if (input.operation === "cancel") {
      for (const term of plan.terms.filter((t) => t.status==='scheduled')) await admin.cancelSessionWithClient(client,term.id,input.reason,context);
    } else for (const {term,start,end,date} of plan.changes) {
      if (term.status === "cancelled") {
        // Deliberately resume the session only. Old cancelled bookings remain cancelled.
        await client.query("UPDATE class_sessions SET status='scheduled' WHERE id=$1",[term.id]);
      }
      await admin.updateSessionWithClient(client,term.id,{
        classTypeId:next.class_type_id,instructorId:next.instructor_id,startAt:start.toISOString(),
        durationMinutes:(end.getTime()-start.getTime())/60000,capacity:next.capacity,priceCents:next.price_cents,
        arrivalLeadMinutes:term.arrival_lead_minutes,locationName:term.location_name,locationAddress:term.location_address,
        equipment:next.class_type_id !== rule.class_type_id ? next.equipment : term.equipment,
        suitability:next.class_type_id !== rule.class_type_id ? next.suitability : term.suitability,changeReason:input.reason
      },context);
      await client.query(`UPDATE class_sessions SET booking_paused=$2,weekly_occurrence_date=$3::date,
        booking_opens_at=start_at-make_interval(days=>$4),updated_at=now() WHERE id=$1`,[term.id,next.booking_paused,date,next.booking_lead_days]);
      if (input.updateBookedPrices) for (const b of term.bookings.filter((b) => b.price !== next.price_cents)) {
        await client.query("UPDATE bookings SET price_snapshot_cents=$2,updated_at=now() WHERE id=$1",[b.id,next.price_cents]);
        await client.query(`UPDATE booking_idempotency SET response_body=jsonb_set(response_body,'{session,price}',
          jsonb_build_object('amount',$2::text,'currency','CZK'),true) WHERE booking_id=$1`,[b.id,(next.price_cents/100).toFixed(2)]);
        await client.query(`INSERT INTO account_notifications (user_id,booking_id,kind,title,body)
          VALUES ($1,$2,'session_changed',$3,$4)`,[b.userId,b.id,`Změna ceny lekce ${next.class_name}`,`Nová cena rezervace je ${(next.price_cents/100).toFixed(2)} Kč. ${input.reason}`]);
        await audit(client,context,"booking.price_changed","booking",b.id,{oldPriceCents:b.price,newPriceCents:next.price_cents,reason:input.reason});
      }
    }
    await audit(client,context,"weekly_schedule_rule.versioned","weekly_schedule_rule",nextId,{predecessorId:rule.id,from,through,input:reviewedInput,terms:plan.terms.map((t)=>t.id),exceptions:plan.exceptions.map((t)=>t.id)});
  }
  return summary;
}

async function cloneRule(client: PoolClient, rule: Rule, predecessorId: string, from: string, through: string | null) {
  return (await client.query<{id:string}>(`INSERT INTO weekly_schedule_rules
    (class_type_id,instructor_id,weekday,local_start_time,duration_minutes,arrival_lead_minutes,location_name,location_address,
     price_cents,capacity,booking_lead_days,equipment,suitability,generate_from,generate_until,active,booking_paused,session_cancelled,predecessor_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
    [rule.class_type_id,rule.instructor_id,rule.weekday,rule.local_start_time,rule.duration_minutes,rule.arrival_lead_minutes,
      rule.location_name,rule.location_address,rule.price_cents,rule.capacity,rule.booking_lead_days,rule.equipment,rule.suitability,
      from,through,rule.active,rule.booking_paused,rule.session_cancelled,predecessorId])).rows[0]!.id;
}
async function linkTerm(client: PoolClient, term: Term, ruleId: string) {
  await client.query("UPDATE class_sessions SET weekly_rule_id=$2,weekly_occurrence_date=coalesce(weekly_occurrence_date,$3::date) WHERE id=$1",[term.id,ruleId,term.local_date]);
}
async function audit(client: PoolClient, context: MutationContext, action: string, entity: string, id: string, metadata: unknown) {
  await client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id,metadata)
    VALUES ('admin',$1,$2,$3,$4,$5,$6::jsonb)`,[context.session.subject,action,entity,id,context.requestId,JSON.stringify(metadata)]);
}

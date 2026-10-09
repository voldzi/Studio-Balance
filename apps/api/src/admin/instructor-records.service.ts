import { createHash } from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { DatabaseService } from "../database/database.service.js";
import { applyAttendanceWithClient } from "./attendance-mutation.js";
import type { MutationContext } from "./admin.service.js";

export type SessionCompletionInput = {
  instructorId: string; startAt: string; endAt: string; rewardCents: number | null;
  absentBookingIds: string[]; rosterToken: string; expectedVersion: number | null; reason: string;
};
type SessionRow = QueryResultRow & {
  id: string; class_type_id: string; class_name: string; instructor_id: string; instructor_name: string;
  start_at: Date; end_at: Date; status: string; updated_at: Date;
};
type RecordRow = QueryResultRow & {
  id: string; session_id: string; instructor_id: string; instructor_name_snapshot: string; class_name_snapshot: string;
  actual_start_at: Date; actual_end_at: Date; reward_cents: number | null; participants_snapshot: number;
  version: number; submission_hash: string; confirmed_at: Date; updated_at: Date; attendance_changed?: boolean;
};
type RosterRow = QueryResultRow & {
  id: string; user_id: string; status: string; price_snapshot_cents: number; updated_at: Date;
  participant_kind: "self" | "companion"; participant_name: string | null; first_name: string | null; last_name: string | null;
};
const eligibleStatuses = ["reserved", "attended", "no_show"];
const sessionSelect = `SELECT s.id,s.class_type_id,ct.name AS class_name,s.instructor_id,i.display_name AS instructor_name,
  s.start_at,s.end_at,s.status,s.updated_at FROM class_sessions s
  JOIN class_types ct ON ct.id=s.class_type_id JOIN instructors i ON i.id=s.instructor_id`;
// PostgreSQL now() is transaction-start time: a mutation that waits on our lock
// can have an earlier timestamp despite running later. Compare the exact roster
// snapshot instead of assuming that timestamps increase across transactions.
const attendanceSnapshotSql = `SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',b.id,'status',b.status,'updatedAt',to_char(b.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY b.id),'[]'::jsonb)
  FROM bookings b WHERE b.session_id=r.session_id`;
const recordSelect = `SELECT r.*,
  r.attendance_snapshot IS DISTINCT FROM (${attendanceSnapshotSql}) AS attendance_changed
  FROM instructor_lesson_records r`;

@Injectable()
export class InstructorRecordsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listMonth(month: string) {
    if (!/^(20[0-9]{2})-(0[1-9]|1[0-2])$/.test(month)) throw validation();
    return this.database.transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      // Convert Prague calendar boundaries independently so March/October DST never shifts membership.
      const bounds = [`${month}-01`];
      const records = (await client.query<RecordRow>(`${recordSelect}
        WHERE r.actual_start_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Prague')
          AND r.actual_start_at < (($1::date + interval '1 month') AT TIME ZONE 'Europe/Prague')
        ORDER BY r.actual_start_at,r.instructor_id,r.id`, bounds)).rows;
      const unconfirmed = (await client.query<SessionRow>(`${sessionSelect}
        WHERE s.start_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Prague')
          AND s.start_at < (($1::date + interval '1 month') AT TIME ZONE 'Europe/Prague')
          AND s.end_at <= now() AND s.status IN ('scheduled','completed')
          AND NOT EXISTS (SELECT 1 FROM instructor_lesson_records r WHERE r.session_id=s.id)
        ORDER BY s.start_at,s.id`, bounds)).rows;
      const summary = new Map<string, { instructorId: string; instructorName: string; lessons: number; minutes: number; rewardCents: number; pendingRewards: number }>();
      for (const row of records) {
        const item = summary.get(row.instructor_id) ?? { instructorId: row.instructor_id, instructorName: row.instructor_name_snapshot, lessons: 0, minutes: 0, rewardCents: 0, pendingRewards: 0 };
        item.lessons += 1;
        item.minutes += minutes(row);
        item.rewardCents += row.reward_cents ?? 0;
        item.pendingRewards += row.reward_cents === null ? 1 : 0;
        summary.set(row.instructor_id, item);
      }
      return { month, timeZone: "Europe/Prague" as const, summary: [...summary.values()], records: records.map(mapRecord), unconfirmedSessions: unconfirmed.map(mapSession) };
    });
  }

  async getCompletion(id: string) {
    return this.database.transaction(async (client) => {
      // A shared session lock gives the form one coherent roster/version; all mutations acquire session first.
      const session = (await client.query<SessionRow>(`${sessionSelect} WHERE s.id=$1 FOR SHARE OF s`, [id])).rows[0];
      if (!session) throw notFound();
      const record = (await client.query<RecordRow>(`${recordSelect} WHERE r.session_id=$1`, [id])).rows[0];
      const roster = await readRoster(client, id);
      return { session: mapSession(session), record: record ? mapRecord(record) : null, rosterToken: rosterToken(session, record, roster),
        bookings: roster.filter((row) => eligibleStatuses.includes(row.status)).map((row) => ({ id: row.id, status: row.status, priceCents: row.price_snapshot_cents,
          participantKind: row.participant_kind, participantName: row.participant_name,
          ownerName: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Klient bez doplněného jména" })) };
    });
  }

  async complete(id: string, input: SessionCompletionInput, context: MutationContext) {
    const startAt = new Date(input.startAt); const endAt = new Date(input.endAt);
    validateTimes(startAt, endAt);
    const submittedHash = submissionHash(input);
    return this.database.transaction(async (client) => {
      await client.query("LOCK TABLE class_sessions, bookings, cancellation_fees IN ROW EXCLUSIVE MODE");
      const session = (await client.query<SessionRow>(`${sessionSelect} WHERE s.id=$1 FOR UPDATE OF s`, [id])).rows[0];
      if (!session) throw notFound();
      if (!["scheduled", "completed"].includes(session.status)) throw conflict("Zrušenou lekci nelze potvrdit jako odučenou.");
      if (session.end_at > new Date() || endAt > new Date()) throw conflict("Lekci a její účast lze potvrdit až po skončení.");
      if (Math.abs(startAt.getTime() - session.start_at.getTime()) > 24 * 60 * 60_000) throw validation("Skutečný začátek musí odpovídat dni lekce; větší přesun upravte v rozvrhu.");
      const record = (await client.query<RecordRow>(`${recordSelect} WHERE r.session_id=$1 FOR UPDATE OF r`, [id])).rows[0];
      const roster = await readRoster(client, id, true);
      // An identical HTTP retry returns the persisted result before stale-token validation.
      if (record?.submission_hash === submittedHash) return completionResult(record, roster);
      if ((record?.version ?? null) !== input.expectedVersion || rosterToken(session, record, roster) !== input.rosterToken) {
        throw conflict("Seznam účastníků nebo výkaz se změnil. Načtěte lekci znovu a zkontrolujte údaje.");
      }
      const instructor = (await client.query<{ display_name: string }>("SELECT display_name FROM instructors WHERE id=$1", [input.instructorId])).rows[0];
      if (!instructor) throw validation("Vyberte existujícího instruktora.");
      const absent = new Set(input.absentBookingIds);
      if (input.absentBookingIds.some((bookingId) => !roster.some((row) => row.id === bookingId && ["reserved", "no_show"].includes(row.status)))) {
        throw conflict("Neúčast vybírejte pouze u nepotvrzených rezervací. Již potvrzenou docházku opravte samostatně.");
      }
      for (const row of roster) {
        if (row.status !== "reserved") continue;
        const status = absent.has(row.id) ? "no_show" : "attended";
        await applyAttendanceWithClient(client, row, status, input.reason, context);
        row.status = status;
      }
      const participants = roster.filter((row) => row.status === "attended").length;
      // Capture after all attendance writes, under the same session/booking locks.
      const snapshot = (await client.query<{ snapshot: unknown[] }>(`SELECT (${attendanceSnapshotSql.replace("r.session_id", "$1")}) AS snapshot`, [id])).rows[0]!.snapshot;
      let saved: RecordRow;
      if (record) {
        saved = (await client.query<RecordRow>(`UPDATE instructor_lesson_records SET instructor_id=$2,instructor_name_snapshot=$3,
          actual_start_at=$4,actual_end_at=$5,reward_cents=$6,participants_snapshot=$7,version=version+1,
          submission_hash=$8,updated_by=$9,updated_at=now(),attendance_snapshot=$10::jsonb WHERE session_id=$1 RETURNING *`,
          [id,input.instructorId,instructor.display_name,startAt,endAt,input.rewardCents,participants,submittedHash,context.session.subject,JSON.stringify(snapshot)])).rows[0]!;
      } else {
        const original = { classTypeId: session.class_type_id, className: session.class_name, instructorId: session.instructor_id,
          instructorName: session.instructor_name, startAt: session.start_at.toISOString(), endAt: session.end_at.toISOString() };
        saved = (await client.query<RecordRow>(`INSERT INTO instructor_lesson_records
          (session_id,instructor_id,instructor_name_snapshot,class_name_snapshot,actual_start_at,actual_end_at,reward_cents,
           participants_snapshot,original_snapshot,submission_hash,confirmed_by,updated_by,attendance_snapshot)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12::jsonb) RETURNING *`,
          [id,input.instructorId,instructor.display_name,session.class_name,startAt,endAt,input.rewardCents,participants,original,submittedHash,context.session.subject,JSON.stringify(snapshot)])).rows[0]!;
      }
      await client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id,metadata)
        VALUES ('admin',$1,$2,'instructor_lesson_record',$3,$4,$5)`, [context.session.subject,
        record ? "instructor_lesson_record.corrected" : "instructor_lesson_record.confirmed", saved.id, context.requestId,
        { sessionId: id, reason: input.reason, before: record ? auditRecord(record) : null, after: auditRecord(saved) }]);
      return completionResult(saved, roster);
    });
  }
}

async function readRoster(client: PoolClient, id: string, lock = false): Promise<RosterRow[]> {
  return (await client.query<RosterRow>(`SELECT b.id,b.user_id,b.status,b.price_snapshot_cents,b.updated_at,
    b.participant_kind,b.participant_name,u.first_name,u.last_name FROM bookings b
    JOIN user_profiles u ON u.id=b.user_id WHERE b.session_id=$1 ORDER BY b.id${lock ? " FOR UPDATE OF b" : ""}`, [id])).rows;
}
function rosterToken(session: SessionRow, record: RecordRow | undefined, roster: RosterRow[]) {
  return hash({ session: [session.id, session.status, session.class_type_id, session.instructor_id, session.start_at.toISOString(), session.end_at.toISOString(), session.updated_at.toISOString()],
    version: record?.version ?? null, bookings: roster.map((row) => [row.id, row.status, row.price_snapshot_cents, row.updated_at.toISOString()]) });
}
function submissionHash(input: SessionCompletionInput) {
  return hash({ instructorId: input.instructorId, startAt: new Date(input.startAt).toISOString(), endAt: new Date(input.endAt).toISOString(),
    rewardCents: input.rewardCents, absentBookingIds: [...input.absentBookingIds].sort(), rosterToken: input.rosterToken,
    expectedVersion: input.expectedVersion, reason: input.reason });
}
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function minutes(row: RecordRow) { return (row.actual_end_at.getTime() - row.actual_start_at.getTime()) / 60_000; }
function mapRecord(row: RecordRow) {
  return { id: row.id, sessionId: row.session_id, instructorId: row.instructor_id, instructorName: row.instructor_name_snapshot,
    className: row.class_name_snapshot, startAt: row.actual_start_at.toISOString(), endAt: row.actual_end_at.toISOString(), minutes: minutes(row),
    rewardCents: row.reward_cents, participants: row.participants_snapshot, version: row.version, attendanceChanged: row.attendance_changed ?? false,
    confirmedAt: row.confirmed_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
function mapSession(row: SessionRow) {
  return { id: row.id, className: row.class_name, instructorId: row.instructor_id, instructorName: row.instructor_name,
    startAt: row.start_at.toISOString(), endAt: row.end_at.toISOString(), status: row.status };
}
function auditRecord(row: RecordRow) {
  return { instructorId: row.instructor_id, startAt: row.actual_start_at.toISOString(), endAt: row.actual_end_at.toISOString(),
    rewardCents: row.reward_cents, participants: row.participants_snapshot, version: row.version };
}
function completionResult(record: RecordRow, roster: RosterRow[]) {
  return { record: mapRecord(record), attendedCount: roster.filter((row) => row.status === "attended").length,
    noShowCount: roster.filter((row) => row.status === "no_show").length };
}
function validateTimes(start: Date, end: Date) {
  const duration = (end.getTime() - start.getTime()) / 60_000;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || duration < 15 || duration > 240
      || start.getTime() % 60_000 !== 0 || end.getTime() % 60_000 !== 0) throw validation("Lekce musí trvat 15 až 240 minut; čas zadejte na celé minuty.");
}
function conflict(message: string) { return new HttpException({ code: "INSTRUCTOR_RECORD_CONFLICT", message }, HttpStatus.CONFLICT); }
function validation(message = "Zkontrolujte údaje odučené lekce.") { return new HttpException({ code: "VALIDATION_ERROR", message }, HttpStatus.BAD_REQUEST); }
function notFound() { return new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Termín nebyl nalezen." }, HttpStatus.NOT_FOUND); }

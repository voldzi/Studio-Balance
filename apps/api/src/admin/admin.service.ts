import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import type { StudioSession } from "../auth/session.js";
import { DatabaseService } from "../database/database.service.js";

type MutationContext = { requestId: string; session: StudioSession };
export type AdminClassTypeInput = {
  active: boolean;
  arrivalLeadMinutes: number;
  audience: string;
  benefits: string;
  defaultEquipment: string;
  description: string;
  difficulty: number;
  durationMinutes: number;
  heroImageAlt: string;
  heroImagePath: string;
  name: string;
  practicalNotice: string;
  seoDescription: string;
  seoTitle: string;
  slug: string;
  sortOrder: number;
  suitableForBeginners: boolean;
  tagline: string;
  whatToBring: string;
};
export type AdminInstructorInput = { active: boolean; bio: string; displayName: string; sortOrder: number };
export type AdminSessionInput = { arrivalLeadMinutes: number; capacity: number; classTypeId: string; durationMinutes: number; equipment: string; instructorId: string; locationAddress: string; locationName: string; priceCents: number; startAt: string; suitability: string };
type DashboardSessionRow = { booking_count: number; capacity: number; class_name: string; id: string; instructor_name: string; start_at: Date; status: string };
type ClassTypeRow = { active: boolean; arrival_lead_minutes: number; audience: string; benefits: string; default_equipment: string; description: string; difficulty: number; duration_minutes: number; hero_image_alt: string; hero_image_path: string; id: string; name: string; practical_notice: string; seo_description: string; seo_title: string; slug: string; sort_order: number; suitable_for_beginners: boolean; tagline: string; what_to_bring: string };
type InstructorRow = { active: boolean; bio: string; display_name: string; id: string; sort_order: number };
type AdminSessionRow = { arrival_lead_minutes: number; booking_count: number; capacity: number; change_notice: string | null; class_name: string; class_type_id: string; end_at: Date; equipment: string; id: string; instructor_id: string; instructor_name: string; location_address: string; location_name: string; price_cents: number; start_at: Date; status: string; suitability: string };
type UserRow = { booking_count: number; created_at: Date; email: string; email_verified: boolean; first_name: string | null; id: string; last_name: string | null; phone: string | null };
type AdminBookingRow = { class_name: string; created_at: Date; email: string; first_name: string | null; id: string; last_name: string | null; phone: string | null; price_snapshot_cents: number; session_id: string; source: string; start_at: Date; status: string; user_id: string };
type AttendanceRow = { id: string; price_snapshot_cents: number; status: string; user_id: string };
type DashboardMetricsRow = {
  attended_90_days: string;
  attended_this_month: string;
  estimated_attended_value_this_month_cents: string;
  late_cancellations_this_month: string;
  no_shows_90_days: string;
  no_shows_this_month: string;
  reservations_this_week: string;
};
type ClassPopularityRow = { attended: number; class_name: string; class_type_id: string; reservations: number };
type WeeklyAttendanceRow = { attended: number; week_start: string };

@Injectable()
export class AdminService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async dashboard() {
    const [sessions, bookings, clients, metrics, classPopularity, weeklyAttendance] = await Promise.all([
      this.database.query<DashboardSessionRow>(`
        SELECT s.id, s.start_at, s.status, s.capacity, ct.name AS class_name, i.display_name AS instructor_name,
          count(b.id) FILTER (WHERE b.status = 'reserved')::int AS booking_count
        FROM class_sessions s
        JOIN class_types ct ON ct.id = s.class_type_id
        JOIN instructors i ON i.id = s.instructor_id
        LEFT JOIN bookings b ON b.session_id = s.id
        WHERE s.start_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague'
          AND s.start_at < (date_trunc('day', now() AT TIME ZONE 'Europe/Prague') + interval '8 days') AT TIME ZONE 'Europe/Prague'
        GROUP BY s.id, ct.name, i.display_name ORDER BY s.start_at
      `),
      this.database.query<{ count: string }>("SELECT count(*)::text AS count FROM bookings WHERE status = 'reserved'"),
      this.database.query<{ count: string }>("SELECT count(*)::text AS count FROM user_profiles"),
      this.database.query<DashboardMetricsRow>(`
        WITH bounds AS (
          SELECT
            date_trunc('week', now() AT TIME ZONE 'Europe/Prague') AS week_start_local,
            date_trunc('month', now() AT TIME ZONE 'Europe/Prague') AS month_start_local,
            now() - interval '90 days' AS ninety_days_ago
        )
        SELECT
          count(b.id) FILTER (
            WHERE s.start_at >= bounds.week_start_local AT TIME ZONE 'Europe/Prague'
              AND s.start_at < (bounds.week_start_local + interval '7 days') AT TIME ZONE 'Europe/Prague'
              AND b.status IN ('reserved','attended','no_show','cancelled_late')
          )::text AS reservations_this_week,
          count(b.id) FILTER (
            WHERE s.start_at >= bounds.month_start_local AT TIME ZONE 'Europe/Prague'
              AND s.start_at < (bounds.month_start_local + interval '1 month') AT TIME ZONE 'Europe/Prague'
              AND b.status = 'attended'
          )::text AS attended_this_month,
          count(b.id) FILTER (
            WHERE s.start_at >= bounds.month_start_local AT TIME ZONE 'Europe/Prague'
              AND s.start_at < (bounds.month_start_local + interval '1 month') AT TIME ZONE 'Europe/Prague'
              AND b.status = 'no_show'
          )::text AS no_shows_this_month,
          count(b.id) FILTER (
            WHERE s.start_at >= bounds.month_start_local AT TIME ZONE 'Europe/Prague'
              AND s.start_at < (bounds.month_start_local + interval '1 month') AT TIME ZONE 'Europe/Prague'
              AND b.status = 'cancelled_late'
          )::text AS late_cancellations_this_month,
          count(b.id) FILTER (WHERE s.start_at >= bounds.ninety_days_ago AND b.status = 'attended')::text AS attended_90_days,
          count(b.id) FILTER (WHERE s.start_at >= bounds.ninety_days_ago AND b.status = 'no_show')::text AS no_shows_90_days,
          coalesce(sum(b.price_snapshot_cents) FILTER (
            WHERE s.start_at >= bounds.month_start_local AT TIME ZONE 'Europe/Prague'
              AND s.start_at < (bounds.month_start_local + interval '1 month') AT TIME ZONE 'Europe/Prague'
              AND b.status = 'attended'
          ), 0)::text AS estimated_attended_value_this_month_cents
        FROM bounds
        LEFT JOIN class_sessions s ON true
        LEFT JOIN bookings b ON b.session_id = s.id
      `),
      this.database.query<ClassPopularityRow>(`
        SELECT ct.id AS class_type_id, ct.name AS class_name,
          count(b.id) FILTER (WHERE b.status IN ('reserved','attended'))::int AS reservations,
          count(b.id) FILTER (WHERE b.status = 'attended')::int AS attended
        FROM class_types ct
        LEFT JOIN class_sessions s ON s.class_type_id = ct.id AND s.start_at >= now() - interval '90 days'
        LEFT JOIN bookings b ON b.session_id = s.id
        WHERE ct.active = true
        GROUP BY ct.id, ct.name, ct.sort_order
        ORDER BY attended DESC, reservations DESC, ct.sort_order, ct.name
      `),
      this.database.query<WeeklyAttendanceRow>(`
        WITH weeks AS (
          SELECT generate_series(
            date_trunc('week', now() AT TIME ZONE 'Europe/Prague') - interval '7 weeks',
            date_trunc('week', now() AT TIME ZONE 'Europe/Prague'),
            interval '1 week'
          ) AS week_local
        )
        SELECT to_char(weeks.week_local::date, 'YYYY-MM-DD') AS week_start,
          count(b.id) FILTER (WHERE b.status = 'attended')::int AS attended
        FROM weeks
        LEFT JOIN class_sessions s
          ON s.start_at >= weeks.week_local AT TIME ZONE 'Europe/Prague'
          AND s.start_at < (weeks.week_local + interval '1 week') AT TIME ZONE 'Europe/Prague'
        LEFT JOIN bookings b ON b.session_id = s.id
        GROUP BY weeks.week_local
        ORDER BY weeks.week_local
      `)
    ]);
    const items = sessions.rows.map((row) => ({
      id: row.id, startAt: row.start_at.toISOString(), status: row.status, capacity: row.capacity,
      bookingCount: row.booking_count, className: row.class_name, instructorName: row.instructor_name
    }));
    const metric = metrics.rows[0];
    const attended90Days = Number(metric?.attended_90_days ?? 0);
    const noShows90Days = Number(metric?.no_shows_90_days ?? 0);
    const attendanceDecisions90Days = attended90Days + noShows90Days;
    return {
      activeBookings: Number(bookings.rows[0]?.count ?? 0),
      clients: Number(clients.rows[0]?.count ?? 0),
      today: items.filter((item) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date(item.startAt)) === new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date())),
      nextWeek: items,
      metrics: {
        reservationsThisWeek: Number(metric?.reservations_this_week ?? 0),
        attendedThisMonth: Number(metric?.attended_this_month ?? 0),
        noShowsThisMonth: Number(metric?.no_shows_this_month ?? 0),
        lateCancellationsThisMonth: Number(metric?.late_cancellations_this_month ?? 0),
        attendanceRate90Days: attendanceDecisions90Days ? Math.round(attended90Days / attendanceDecisions90Days * 100) : null,
        estimatedAttendedValueThisMonthCents: Number(metric?.estimated_attended_value_this_month_cents ?? 0)
      },
      classPopularity: classPopularity.rows.map((row) => ({
        classTypeId: row.class_type_id,
        className: row.class_name,
        reservations: row.reservations,
        attended: row.attended
      })),
      weeklyAttendance: weeklyAttendance.rows.map((row) => ({ weekStart: row.week_start, attended: row.attended }))
    };
  }

  async listClassTypes() {
    const result = await this.database.query<ClassTypeRow>("SELECT id, slug, name, tagline, description, duration_minutes, arrival_lead_minutes, active, sort_order, difficulty, benefits, audience, suitable_for_beginners, default_equipment, what_to_bring, practical_notice, hero_image_path, hero_image_alt, seo_title, seo_description FROM class_types ORDER BY sort_order, name");
    return { items: result.rows.map(mapAdminClassType) };
  }

  async createClassType(data: AdminClassTypeInput, context: MutationContext) {
    const result = await this.database.query<{ id: string }>(`
      INSERT INTO class_types (slug, name, tagline, description, duration_minutes, arrival_lead_minutes, active, sort_order, difficulty, benefits, audience, suitable_for_beginners, default_equipment, what_to_bring, practical_notice, hero_image_path, hero_image_alt, seo_title, seo_description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id
    `, [data.slug, data.name, data.tagline, data.description, data.durationMinutes, data.arrivalLeadMinutes, data.active, data.sortOrder, data.difficulty, data.benefits, data.audience, data.suitableForBeginners, data.defaultEquipment, data.whatToBring, data.practicalNotice, data.heroImagePath, data.heroImageAlt, data.seoTitle, data.seoDescription]);
    await this.audit(context, "class_type.created", "class_type", result.rows[0]!.id);
    return { id: result.rows[0]!.id };
  }

  async updateClassType(id: string, data: AdminClassTypeInput, context: MutationContext) {
    const result = await this.database.query(`
      UPDATE class_types SET slug=$2, name=$3, tagline=$4, description=$5, duration_minutes=$6,
        arrival_lead_minutes=$7, active=$8, sort_order=$9, difficulty=$10, benefits=$11, audience=$12,
        suitable_for_beginners=$13, default_equipment=$14, what_to_bring=$15, practical_notice=$16,
        hero_image_path=$17, hero_image_alt=$18, seo_title=$19, seo_description=$20, updated_at=now()
      WHERE id=$1 RETURNING id
    `, [id, data.slug, data.name, data.tagline, data.description, data.durationMinutes, data.arrivalLeadMinutes, data.active, data.sortOrder, data.difficulty, data.benefits, data.audience, data.suitableForBeginners, data.defaultEquipment, data.whatToBring, data.practicalNotice, data.heroImagePath, data.heroImageAlt, data.seoTitle, data.seoDescription]);
    if (!result.rowCount) throw notFound("Typ lekce nebyl nalezen.");
    await this.audit(context, "class_type.updated", "class_type", id);
    return { id };
  }

  async listInstructors() {
    const result = await this.database.query<InstructorRow>("SELECT id, display_name, bio, active, sort_order FROM instructors ORDER BY sort_order, display_name");
    return { items: result.rows.map((row) => ({ id: row.id, displayName: row.display_name, bio: row.bio, active: row.active, sortOrder: row.sort_order })) };
  }

  async createInstructor(data: AdminInstructorInput, context: MutationContext) {
    const result = await this.database.query<{ id: string }>("INSERT INTO instructors (display_name, bio, active, sort_order) VALUES ($1,$2,$3,$4) RETURNING id", [data.displayName, data.bio, data.active, data.sortOrder]);
    await this.audit(context, "instructor.created", "instructor", result.rows[0]!.id);
    return { id: result.rows[0]!.id };
  }

  async updateInstructor(id: string, data: AdminInstructorInput, context: MutationContext) {
    const result = await this.database.query("UPDATE instructors SET display_name=$2, bio=$3, active=$4, sort_order=$5, updated_at=now() WHERE id=$1 RETURNING id", [id, data.displayName, data.bio, data.active, data.sortOrder]);
    if (!result.rowCount) throw notFound("Instruktor nebyl nalezen.");
    await this.audit(context, "instructor.updated", "instructor", id);
    return { id };
  }

  async listSessions(from: Date, to: Date) {
    const result = await this.database.query<AdminSessionRow>(`
      SELECT s.*, ct.name AS class_name, i.display_name AS instructor_name,
        count(b.id) FILTER (WHERE b.status='reserved')::int AS booking_count
      FROM class_sessions s JOIN class_types ct ON ct.id=s.class_type_id JOIN instructors i ON i.id=s.instructor_id
      LEFT JOIN bookings b ON b.session_id=s.id WHERE s.start_at >= $1 AND s.start_at < $2
      GROUP BY s.id, ct.name, i.display_name ORDER BY s.start_at
    `, [from, to]);
    return { items: result.rows.map(mapAdminSession) };
  }

  async createSession(data: AdminSessionInput, context: MutationContext) {
    const startAt = new Date(data.startAt);
    const endAt = new Date(startAt.getTime() + data.durationMinutes * 60_000);
    const result = await this.database.query<{ id: string }>(`
      INSERT INTO class_sessions (class_type_id,instructor_id,start_at,end_at,arrival_lead_minutes,location_name,location_address,price_cents,capacity,booking_opens_at,booking_closes_at,equipment,suitability)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$3::timestamptz-interval '30 days',$3::timestamptz-interval '30 minutes',$10,$11) RETURNING id
    `, [data.classTypeId, data.instructorId, startAt, endAt, data.arrivalLeadMinutes, data.locationName, data.locationAddress, data.priceCents, data.capacity, data.equipment, data.suitability]);
    await this.audit(context, "session.created", "session", result.rows[0]!.id);
    return { id: result.rows[0]!.id };
  }

  async updateSession(id: string, data: AdminSessionInput, context: MutationContext) {
    return this.database.transaction(async (client) => {
      const active = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM bookings WHERE session_id=$1 AND status='reserved'", [id]);
      if (Number(active.rows[0]?.count ?? 0) > data.capacity) throw conflict("Kapacitu nelze snížit pod počet aktivních rezervací.");
      const startAt = new Date(data.startAt);
      const endAt = new Date(startAt.getTime() + data.durationMinutes * 60_000);
      const result = await client.query(`UPDATE class_sessions SET class_type_id=$2,instructor_id=$3,start_at=$4,end_at=$5,arrival_lead_minutes=$6,location_name=$7,location_address=$8,price_cents=$9,capacity=$10,booking_opens_at=$4::timestamptz-interval '30 days',booking_closes_at=$4::timestamptz-interval '30 minutes',equipment=$11,suitability=$12,updated_at=now() WHERE id=$1 AND status='scheduled' RETURNING id`, [id, data.classTypeId, data.instructorId, startAt, endAt, data.arrivalLeadMinutes, data.locationName, data.locationAddress, data.priceCents, data.capacity, data.equipment, data.suitability]);
      if (!result.rowCount) throw notFound("Aktivní termín nebyl nalezen.");
      await auditWithClient(client, context, "session.updated", "session", id, { activeBookings: Number(active.rows[0]?.count ?? 0) });
      return { id };
    });
  }

  async cancelSession(id: string, reason: string, context: MutationContext) {
    return this.database.transaction(async (client) => {
      const session = await client.query("SELECT id FROM class_sessions WHERE id=$1 FOR UPDATE", [id]);
      if (!session.rowCount) throw notFound("Termín nebyl nalezen.");
      await client.query("UPDATE class_sessions SET status='cancelled', change_notice=$2, updated_at=now() WHERE id=$1", [id, reason]);
      await client.query("UPDATE bookings SET status='cancelled_by_studio', cancelled_at=now(), updated_at=now() WHERE session_id=$1 AND status='reserved'", [id]);
      await client.query("UPDATE cancellation_fees SET status='cancelled', updated_at=now() WHERE booking_id IN (SELECT id FROM bookings WHERE session_id=$1) AND status='due'", [id]);
      await client.query(`INSERT INTO account_notifications (user_id, booking_id, kind, title, body)
        SELECT user_id,id,'session_cancelled','Lekce byla zrušena',$2 FROM bookings WHERE session_id=$1 AND status='cancelled_by_studio'`, [id, reason]);
      await client.query("UPDATE notification_outbox SET status='cancelled', updated_at=now() WHERE booking_id IN (SELECT id FROM bookings WHERE session_id=$1) AND status='pending'", [id]);
      await auditWithClient(client, context, "session.cancelled", "session", id, { reason });
      return { id, status: "cancelled" };
    });
  }

  async listUsers(search?: string) {
    const term = search?.trim() ? `%${search.trim()}%` : null;
    const result = await this.database.query<UserRow>(`SELECT u.id,u.email,u.email_verified,u.first_name,u.last_name,u.phone,u.created_at,
      count(b.id)::int AS booking_count FROM user_profiles u LEFT JOIN bookings b ON b.user_id=u.id
      WHERE $1::text IS NULL OR u.email ILIKE $1 OR concat_ws(' ',u.first_name,u.last_name) ILIKE $1
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`, [term]);
    return { items: result.rows.map((row) => ({ id: row.id, email: row.email, emailVerified: row.email_verified, firstName: row.first_name, lastName: row.last_name, phone: row.phone, bookingCount: row.booking_count, createdAt: row.created_at.toISOString() })) };
  }

  async listBookings(sessionId?: string) {
    const result = await this.database.query<AdminBookingRow>(`SELECT b.id,b.status,b.source,b.created_at,b.price_snapshot_cents,
      u.id AS user_id,u.email,u.first_name,u.last_name,u.phone,s.id AS session_id,s.start_at,ct.name AS class_name
      FROM bookings b JOIN user_profiles u ON u.id=b.user_id JOIN class_sessions s ON s.id=b.session_id
      JOIN class_types ct ON ct.id=s.class_type_id WHERE $1::uuid IS NULL OR s.id=$1 ORDER BY s.start_at DESC,b.created_at`, [sessionId ?? null]);
    return { items: result.rows.map((row) => ({ id: row.id, status: row.status, source: row.source, createdAt: row.created_at.toISOString(), priceCents: row.price_snapshot_cents, user: { id: row.user_id, email: row.email, firstName: row.first_name, lastName: row.last_name, phone: row.phone }, session: { id: row.session_id, startAt: row.start_at.toISOString(), className: row.class_name } })) };
  }

  async attendance(id: string, status: "attended" | "no_show", reason: string, context: MutationContext) {
    return this.database.transaction(async (client) => {
      const current = await client.query<AttendanceRow>("SELECT id,user_id,status,price_snapshot_cents FROM bookings WHERE id=$1 FOR UPDATE", [id]);
      const row = current.rows[0];
      if (!row) throw notFound("Rezervace nebyla nalezena.");
      await client.query("UPDATE bookings SET status=$2,updated_at=now() WHERE id=$1", [id, status]);
      if (status === "no_show") await client.query("INSERT INTO cancellation_fees (booking_id,user_id,amount_cents) VALUES ($1,$2,$3) ON CONFLICT (booking_id) DO UPDATE SET status='due',amount_cents=excluded.amount_cents,settlement_method=NULL,settled_at=NULL,updated_at=now()", [id, row.user_id, row.price_snapshot_cents]);
      if (status === "attended") await client.query("UPDATE cancellation_fees SET status='cancelled',updated_at=now() WHERE booking_id=$1 AND status='due'", [id]);
      await auditWithClient(client, context, "booking.attendance_changed", "booking", id, { from: row.status, to: status, reason });
      return { id, status };
    });
  }

  private audit(context: MutationContext, action: string, entityType: string, entityId: string) {
    return this.database.query("INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id) VALUES ('admin',$1,$2,$3,$4,$5)", [context.session.subject, action, entityType, entityId, context.requestId]);
  }
}

function mapAdminSession(row: AdminSessionRow) { return { id: row.id, classTypeId: row.class_type_id, className: row.class_name, instructorId: row.instructor_id, instructorName: row.instructor_name, startAt: row.start_at.toISOString(), endAt: row.end_at.toISOString(), arrivalLeadMinutes: row.arrival_lead_minutes, locationName: row.location_name, locationAddress: row.location_address, priceCents: row.price_cents, capacity: row.capacity, bookingCount: row.booking_count, status: row.status, equipment: row.equipment, suitability: row.suitability, changeNotice: row.change_notice }; }
function mapAdminClassType(row: ClassTypeRow) { return { id: row.id, slug: row.slug, name: row.name, tagline: row.tagline, description: row.description, durationMinutes: row.duration_minutes, arrivalLeadMinutes: row.arrival_lead_minutes, active: row.active, sortOrder: row.sort_order, difficulty: row.difficulty, benefits: row.benefits, audience: row.audience, suitableForBeginners: row.suitable_for_beginners, defaultEquipment: row.default_equipment, whatToBring: row.what_to_bring, practicalNotice: row.practical_notice, heroImagePath: row.hero_image_path, heroImageAlt: row.hero_image_alt, seoTitle: row.seo_title, seoDescription: row.seo_description }; }
async function auditWithClient(client: PoolClient, context: MutationContext, action: string, entityType: string, entityId: string, metadata: object = {}) { await client.query("INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES ('admin',$1,$2,$3,$4,$5,$6)", [context.session.subject, action, entityType, entityId, context.requestId, metadata]); }
function notFound(message: string) { return new HttpException({ code: "RESOURCE_NOT_FOUND", message }, HttpStatus.NOT_FOUND); }
function conflict(message: string) { return new HttpException({ code: "STATE_CONFLICT", message }, HttpStatus.CONFLICT); }

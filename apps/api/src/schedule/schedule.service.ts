import { Inject, Injectable } from "@nestjs/common";

import { sessionAvailability, type PublicSessionStatus } from "@studiobalance/domain";

import { DatabaseService } from "../database/database.service.js";

type ClassTypeRow = {
  arrival_lead_minutes: number;
  description: string;
  duration_minutes: number;
  id: string;
  name: string;
  slug: string;
  tagline: string;
};

export type PublicSession = {
  arrivalAt: string;
  availability: PublicSessionStatus;
  changeNotice: string | null;
  classType: { name: string; slug: string; tagline: string };
  endAt: string;
  equipment: string;
  id: string;
  instructor: { displayName: string; id: string };
  location: { address: string; name: string };
  price: { amount: string; currency: "CZK" };
  startAt: string;
  suitability: string;
  timezone: "Europe/Prague";
};

export type SessionRow = {
  active_bookings: string;
  arrival_lead_minutes: number;
  booking_closes_at: Date;
  booking_opens_at: Date;
  capacity: number;
  change_notice: string | null;
  class_name: string;
  class_slug: string;
  class_tagline: string;
  end_at: Date;
  equipment: string;
  id: string;
  instructor_id: string;
  instructor_name: string;
  location_address: string;
  location_name: string;
  price_cents: number;
  start_at: Date;
  status: "scheduled" | "cancelled" | "completed";
  suitability: string;
};

const sessionSelect = `
  SELECT
    s.id,
    s.start_at,
    s.end_at,
    s.arrival_lead_minutes,
    s.location_name,
    s.location_address,
    s.price_cents,
    s.capacity,
    s.status,
    s.booking_opens_at,
    s.booking_closes_at,
    s.equipment,
    s.suitability,
    s.change_notice,
    ct.name AS class_name,
    ct.slug AS class_slug,
    ct.tagline AS class_tagline,
    i.id AS instructor_id,
    i.display_name AS instructor_name,
    count(b.id) FILTER (WHERE b.status = 'reserved')::text AS active_bookings
  FROM class_sessions s
  JOIN class_types ct ON ct.id = s.class_type_id
  JOIN instructors i ON i.id = s.instructor_id
  LEFT JOIN bookings b ON b.session_id = s.id
`;

@Injectable()
export class ScheduleService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listClassTypes(): Promise<{ items: ReturnType<typeof mapClassType>[] }> {
    const result = await this.database.query<ClassTypeRow>(`
      SELECT id, slug, name, tagline, description, duration_minutes, arrival_lead_minutes
      FROM class_types
      WHERE active = true
      ORDER BY sort_order, name
    `);
    return { items: result.rows.map(mapClassType) };
  }

  async listSessions(from: Date, to: Date): Promise<{ items: PublicSession[]; timezone: "Europe/Prague" }> {
    const result = await this.database.query<SessionRow>(`${sessionSelect}
      WHERE s.start_at >= $1 AND s.start_at < $2
      GROUP BY s.id, ct.id, i.id
      ORDER BY s.start_at
    `, [from, to]);
    const now = new Date();
    return { items: result.rows.map((row) => mapSession(row, now)), timezone: "Europe/Prague" };
  }

  async getSession(id: string): Promise<PublicSession | undefined> {
    const result = await this.database.query<SessionRow>(`${sessionSelect}
      WHERE s.id = $1
      GROUP BY s.id, ct.id, i.id
    `, [id]);
    return result.rows[0] ? mapSession(result.rows[0], new Date()) : undefined;
  }
}

function mapClassType(row: ClassTypeRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    durationMinutes: row.duration_minutes,
    arrivalLeadMinutes: row.arrival_lead_minutes
  };
}

export function money(cents: number): { amount: string; currency: "CZK" } {
  return { amount: (cents / 100).toFixed(2), currency: "CZK" };
}

export function mapSession(row: SessionRow, now: Date): PublicSession {
  return {
    id: row.id,
    classType: { name: row.class_name, slug: row.class_slug, tagline: row.class_tagline },
    instructor: { id: row.instructor_id, displayName: row.instructor_name },
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    timezone: "Europe/Prague",
    arrivalAt: new Date(row.start_at.getTime() - row.arrival_lead_minutes * 60_000).toISOString(),
    availability: sessionAvailability({
      activeBookings: Number(row.active_bookings),
      bookingClosesAt: row.booking_closes_at,
      bookingOpensAt: row.booking_opens_at,
      capacity: row.capacity,
      endAt: row.end_at,
      now,
      startAt: row.start_at,
      status: row.status
    }),
    price: money(row.price_cents),
    location: { name: row.location_name, address: row.location_address },
    equipment: row.equipment,
    suitability: row.suitability,
    changeNotice: row.change_notice
  };
}

import { createHash } from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import { cancellationMode, sessionAvailability } from "@studiobalance/domain";

import { AccountService, type ProfileRow } from "../account/account.service.js";
import type { StudioSession } from "../auth/session.js";
import { DatabaseService } from "../database/database.service.js";
import { mapSession, money, type PublicSession, type SessionRow } from "../schedule/schedule.service.js";

export const CURRENT_TERMS_VERSION = "2026-08-04";

type BookingStatus = "reserved" | "cancelled_on_time" | "cancelled_late" | "attended" | "no_show" | "cancelled_by_studio";

type LockedSessionRow = Omit<SessionRow, "active_bookings"> & { free_cancellation_until: Date | null };
type BookingRecord = {
  cancellation_cutoff_at: Date;
  created_at: Date;
  id: string;
  price_snapshot_cents: number;
  status: BookingStatus;
};
type BookingListRow = Omit<SessionRow, "status"> & Omit<BookingRecord, "status" | "id"> & {
  booking_id: string;
  booking_status: BookingStatus;
  fee_amount_cents: number | null;
  session_status: "scheduled" | "cancelled" | "completed";
};

export type BookingResponse = {
  cancellationCutoffAt: string;
  createdAt: string;
  fee: ReturnType<typeof money> | null;
  id: string;
  session: PublicSession;
  status: BookingStatus;
};

@Injectable()
export class BookingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccountService) private readonly accounts: AccountService
  ) {}

  async create(input: {
    idempotencyKey: string;
    requestId: string;
    session: StudioSession;
    sessionId: string;
    termsAccepted: true;
    termsVersion: typeof CURRENT_TERMS_VERSION;
  }): Promise<BookingResponse> {
    const profile = await this.requireBookableProfile(input.session);
    const requestHash = hash({ operation: "create", sessionId: input.sessionId, termsVersion: input.termsVersion });

    return this.database.transaction(async (client) => {
      await lockProfile(client, profile.id);
      const replay = await readIdempotency(client, profile.id, input.idempotencyKey, requestHash);
      if (replay) return replay;

      const row = await lockedSession(client, input.sessionId);
      if (!row) throw domainError("RESOURCE_NOT_FOUND", "Termín nebyl nalezen.", HttpStatus.NOT_FOUND);
      const activeBookings = await activeBookingCount(client, row.id);
      const availability = sessionAvailability({
        activeBookings,
        bookingClosesAt: row.booking_closes_at,
        bookingOpensAt: row.booking_opens_at,
        capacity: row.capacity,
        endAt: row.end_at,
        now: new Date(),
        startAt: row.start_at,
        status: row.status
      });
      if (availability === "full") throw domainError("SESSION_FULL", "Omlouváme se, lekce se právě obsadila.", HttpStatus.CONFLICT);
      if (availability !== "bookable") throw domainError("BOOKING_CLOSED", "Rezervace tohoto termínu není otevřená.", HttpStatus.GONE);

      const duplicate = await client.query("SELECT 1 FROM bookings WHERE user_id = $1 AND session_id = $2 AND status = 'reserved'", [profile.id, row.id]);
      if (duplicate.rowCount) throw domainError("BOOKING_ALREADY_EXISTS", "Tuto lekci už máte rezervovanou.", HttpStatus.CONFLICT);

      await client.query(`
        UPDATE user_profiles
        SET terms_version = $2, terms_accepted_at = now(), updated_at = now()
        WHERE id = $1
      `, [profile.id, CURRENT_TERMS_VERSION]);

      const inserted = await client.query<BookingRecord>(`
        INSERT INTO bookings (
          user_id, session_id, source, price_snapshot_cents, terms_version, cancellation_cutoff_at
        )
        VALUES ($1, $2, 'web', $3, $4, $5::timestamptz - interval '24 hours')
        RETURNING id, status, price_snapshot_cents, cancellation_cutoff_at, created_at
      `, [profile.id, row.id, row.price_cents, CURRENT_TERMS_VERSION, row.start_at]);
      const booking = inserted.rows[0]!;
      const response = bookingResponse(booking, mapSession({ ...row, active_bookings: String(activeBookings + 1) }, new Date()), null);

      await client.query(`
        INSERT INTO account_notifications (user_id, booking_id, kind, title, body)
        VALUES ($1, $2, 'booking_confirmed', 'Rezervace je potvrzená', $3)
      `, [profile.id, booking.id, `${row.class_name} · ${row.start_at.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}`]);
      await scheduleEmailNotifications(client, {
        bookingId: booking.id,
        className: row.class_name,
        startAt: row.start_at,
        userId: profile.id
      });
      await audit(client, input.requestId, profile.oidc_subject, "booking.created", "booking", booking.id);
      await storeIdempotency(client, profile.id, input.idempotencyKey, requestHash, booking.id, response);
      return response;
    });
  }

  async listMine(session: StudioSession): Promise<{ items: BookingResponse[] }> {
    const profile = await this.accounts.ensureProfile(session);
    const result = await this.database.query<BookingListRow>(bookingListSql("WHERE b.user_id = $1"), [profile.id]);
    const now = new Date();
    return {
      items: result.rows.map((row) =>
        bookingResponse(
          { ...row, id: row.booking_id, status: row.booking_status },
          mapSession({ ...row, status: row.session_status }, now),
          row.fee_amount_cents
        )
      )
    };
  }

  async cancellationPreview(session: StudioSession, bookingId: string) {
    const profile = await this.accounts.ensureProfile(session);
    const result = await this.database.query<BookingListRow & { free_cancellation_until: Date | null }>(bookingListSql("WHERE b.user_id = $1 AND b.id = $2", true), [profile.id, bookingId]);
    const row = result.rows[0];
    if (!row) throw domainError("RESOURCE_NOT_FOUND", "Rezervace nebyla nalezena.", HttpStatus.NOT_FOUND);
    assertClientCancellationAllowed(row);
    return cancellationPreviewResponse(row, new Date());
  }

  async cancel(input: {
    bookingId: string;
    idempotencyKey: string;
    lateCancellationConfirmed: boolean;
    requestId: string;
    session: StudioSession;
  }): Promise<BookingResponse> {
    const profile = await this.accounts.ensureProfile(input.session);
    const requestHash = hash({ operation: "cancel", bookingId: input.bookingId, confirmed: input.lateCancellationConfirmed });

    return this.database.transaction(async (client) => {
      await lockProfile(client, profile.id);
      const replay = await readIdempotency(client, profile.id, input.idempotencyKey, requestHash);
      if (replay) return replay;

      const result = await client.query<BookingListRow & { free_cancellation_until: Date | null }>(`${bookingListSql("WHERE b.user_id = $1 AND b.id = $2", true)} FOR UPDATE OF b`, [profile.id, input.bookingId]);
      const row = result.rows[0];
      if (!row) throw domainError("RESOURCE_NOT_FOUND", "Rezervace nebyla nalezena.", HttpStatus.NOT_FOUND);
      assertClientCancellationAllowed(row);
      const preview = cancellationPreviewResponse(row, new Date());
      if (preview.mode === "late" && !input.lateCancellationConfirmed) {
        throw domainError("LATE_CANCELLATION_CONFIRMATION_REQUIRED", "Pozdní storno je potřeba výslovně potvrdit.", HttpStatus.CONFLICT);
      }

      const status: BookingStatus = preview.mode === "late" ? "cancelled_late" : "cancelled_on_time";
      await client.query("UPDATE bookings SET status = $2, cancelled_at = now(), updated_at = now() WHERE id = $1", [row.booking_id, status]);
      const fee = status === "cancelled_late" ? row.price_snapshot_cents : null;
      if (fee !== null) {
        await client.query(`
          INSERT INTO cancellation_fees (booking_id, user_id, amount_cents)
          VALUES ($1, $2, $3)
          ON CONFLICT (booking_id) DO NOTHING
        `, [row.booking_id, profile.id, fee]);
      }
      await client.query(`
        INSERT INTO account_notifications (user_id, booking_id, kind, title, body)
        VALUES ($1, $2, 'booking_cancelled', 'Rezervace byla zrušena', $3)
      `, [profile.id, row.booking_id, fee === null ? "Místo bylo uvolněno bez storno poplatku." : "Storno poplatek uhradíte ve studiu."]);
      await client.query("UPDATE notification_outbox SET status='cancelled', updated_at=now() WHERE booking_id=$1 AND status='pending'", [row.booking_id]);
      await audit(client, input.requestId, profile.oidc_subject, "booking.cancelled", "booking", row.booking_id, { mode: preview.mode });

      const response = bookingResponse(
        { ...row, id: row.booking_id, status },
        mapSession({ ...row, status: row.session_status }, new Date()),
        fee
      );
      await storeIdempotency(client, profile.id, input.idempotencyKey, requestHash, row.booking_id, response);
      return response;
    });
  }

  private async requireBookableProfile(session: StudioSession): Promise<ProfileRow> {
    const profile = await this.accounts.ensureProfile(session);
    if (!profile.email_verified) throw domainError("EMAIL_NOT_VERIFIED", "Před rezervací prosím ověřte e-mail.", HttpStatus.FORBIDDEN);
    if (!profile.first_name || !profile.last_name || !profile.phone) {
      throw domainError("PROFILE_INCOMPLETE", "Před rezervací doplňte jméno a telefon.", HttpStatus.FORBIDDEN);
    }
    return profile;
  }
}

function bookingResponse(booking: BookingRecord, session: PublicSession, feeCents: number | null): BookingResponse {
  return {
    id: booking.id,
    status: booking.status,
    createdAt: booking.created_at.toISOString(),
    cancellationCutoffAt: booking.cancellation_cutoff_at.toISOString(),
    fee: feeCents === null ? null : money(feeCents),
    session
  };
}

function cancellationPreviewResponse(row: BookingListRow & { free_cancellation_until: Date | null }, now: Date) {
  const mode = cancellationMode({ cutoffAt: row.cancellation_cutoff_at, freeCancellationUntil: row.free_cancellation_until, now });
  return {
    mode,
    cutoffAt: row.cancellation_cutoff_at.toISOString(),
    fee: mode === "late" ? money(row.price_snapshot_cents) : null,
    paymentMethod: "at_studio" as const
  };
}

function assertClientCancellationAllowed(row: BookingListRow): void {
  if (row.booking_status !== "reserved") throw domainError("BOOKING_STATE_CONFLICT", "Rezervaci už nelze zrušit.", HttpStatus.CONFLICT);
  if (new Date() >= row.start_at) throw domainError("BOOKING_STATE_CONFLICT", "Po začátku lekce může rezervaci změnit jen studio.", HttpStatus.CONFLICT);
}

function bookingListSql(where: string, includeFreeWindow = false): string {
  return `
    SELECT
      b.id AS booking_id,
      b.status AS booking_status,
      b.price_snapshot_cents,
      b.cancellation_cutoff_at,
      b.created_at,
      s.id,
      s.start_at,
      s.end_at,
      s.arrival_lead_minutes,
      s.location_name,
      s.location_address,
      s.price_cents,
      s.capacity,
      s.status AS session_status,
      s.booking_opens_at,
      s.booking_closes_at,
      s.equipment,
      s.suitability,
      s.change_notice,
      ${includeFreeWindow ? "s.free_cancellation_until," : "NULL::timestamptz AS free_cancellation_until,"}
      ct.name AS class_name,
      ct.slug AS class_slug,
      ct.tagline AS class_tagline,
      i.id AS instructor_id,
      i.display_name AS instructor_name,
      (SELECT count(*)::text FROM bookings active WHERE active.session_id = s.id AND active.status = 'reserved') AS active_bookings,
      cf.amount_cents AS fee_amount_cents
    FROM bookings b
    JOIN class_sessions s ON s.id = b.session_id
    JOIN class_types ct ON ct.id = s.class_type_id
    JOIN instructors i ON i.id = s.instructor_id
    LEFT JOIN cancellation_fees cf ON cf.booking_id = b.id AND cf.status = 'due'
    ${where}
    ORDER BY s.start_at DESC
  `;
}

async function lockedSession(client: PoolClient, id: string): Promise<LockedSessionRow | undefined> {
  const result = await client.query<LockedSessionRow>(`
    SELECT
      s.id, s.start_at, s.end_at, s.arrival_lead_minutes, s.location_name, s.location_address,
      s.price_cents, s.capacity, s.status, s.booking_opens_at, s.booking_closes_at,
      s.free_cancellation_until, s.equipment, s.suitability, s.change_notice,
      ct.name AS class_name, ct.slug AS class_slug, ct.tagline AS class_tagline,
      i.id AS instructor_id, i.display_name AS instructor_name
    FROM class_sessions s
    JOIN class_types ct ON ct.id = s.class_type_id
    JOIN instructors i ON i.id = s.instructor_id
    WHERE s.id = $1
    FOR UPDATE OF s
  `, [id]);
  return result.rows[0];
}

async function activeBookingCount(client: PoolClient, sessionId: string): Promise<number> {
  const result = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM bookings WHERE session_id = $1 AND status = 'reserved'", [sessionId]);
  return Number(result.rows[0]?.count ?? 0);
}

async function lockProfile(client: PoolClient, profileId: string): Promise<void> {
  await client.query("SELECT id FROM user_profiles WHERE id = $1 FOR UPDATE", [profileId]);
}

async function readIdempotency(client: PoolClient, userId: string, key: string, requestHash: string): Promise<BookingResponse | undefined> {
  const result = await client.query<{ request_hash: string; response_body: BookingResponse }>("SELECT request_hash, response_body FROM booking_idempotency WHERE user_id = $1 AND idempotency_key = $2", [userId, key]);
  const row = result.rows[0];
  if (!row) return undefined;
  if (row.request_hash !== requestHash) throw domainError("IDEMPOTENCY_KEY_REUSED", "Tento opakovací klíč už patří jinému požadavku.", HttpStatus.CONFLICT);
  return row.response_body;
}

async function storeIdempotency(client: PoolClient, userId: string, key: string, requestHash: string, bookingId: string, response: BookingResponse): Promise<void> {
  await client.query("INSERT INTO booking_idempotency (user_id, idempotency_key, request_hash, booking_id, response_body) VALUES ($1, $2, $3, $4, $5)", [userId, key, requestHash, bookingId, response]);
}

async function scheduleEmailNotifications(client: PoolClient, input: { bookingId: string; className: string; startAt: Date; userId: string }): Promise<void> {
  const reminders = [
    { kind: "booking_confirmation", scheduledAt: new Date(), subject: "Rezervace je potvrzená" },
    { kind: "lesson_reminder", scheduledAt: new Date(input.startAt.getTime() - 24 * 60 * 60_000), subject: "Zítra vás čeká lekce" },
    { kind: "lesson_reminder", scheduledAt: new Date(input.startAt.getTime() - 2 * 60 * 60_000), subject: "Dnes vás čeká lekce" },
    { kind: "lesson_reminder", scheduledAt: new Date(input.startAt.getTime() - 30 * 60_000), subject: "Za chvíli začínáme" }
  ].filter((item) => item.scheduledAt.getTime() >= Date.now());

  for (const item of reminders) {
    await client.query(`
      INSERT INTO notification_outbox (user_id, booking_id, kind, channel, scheduled_at, payload)
      VALUES ($1, $2, $3, 'email', $4, $5)
      ON CONFLICT (booking_id, kind, scheduled_at) DO NOTHING
    `, [input.userId, input.bookingId, item.kind, item.scheduledAt, {
      className: input.className,
      startAt: input.startAt.toISOString(),
      subject: item.subject,
      timezone: "Europe/Prague"
    }]);
  }
}

async function audit(client: PoolClient, requestId: string, actorId: string, action: string, entityType: string, entityId: string, metadata: object = {}): Promise<void> {
  await client.query(`
    INSERT INTO application_audit (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
    VALUES ('client', $1, $2, $3, $4, $5, $6)
  `, [actorId, action, entityType, entityId, requestId, metadata]);
}

function hash(value: object): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function domainError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ code, message }, status);
}

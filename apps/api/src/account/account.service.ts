import { Inject, Injectable } from "@nestjs/common";

import type { StudioSession } from "../auth/session.js";
import { DatabaseService } from "../database/database.service.js";

export type ProfileRow = {
  email: string;
  email_verified: boolean;
  first_name: string | null;
  id: string;
  last_name: string | null;
  oidc_subject: string;
  phone: string | null;
  terms_version: string | null;
};

export type AccountNotificationRow = {
  body: string;
  created_at: Date;
  id: string;
  kind: "booking_confirmed" | "booking_cancelled" | "lesson_reminder" | "session_changed" | "session_cancelled";
  read_at: Date | null;
  title: string;
};

@Injectable()
export class AccountService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async ensureProfile(session: StudioSession): Promise<ProfileRow> {
    const result = await this.database.query<ProfileRow>(`
      INSERT INTO user_profiles (oidc_subject, email, email_verified)
      VALUES ($1, lower($2), $3)
      ON CONFLICT (oidc_subject) DO UPDATE
      SET email = lower(EXCLUDED.email), email_verified = EXCLUDED.email_verified, updated_at = now()
      RETURNING id, oidc_subject, email, email_verified, first_name, last_name, phone, terms_version
    `, [session.subject, session.email, session.emailVerified]);
    return result.rows[0]!;
  }

  async updateProfile(session: StudioSession, input: { firstName: string; lastName: string; phone: string }): Promise<ProfileRow> {
    const profile = await this.ensureProfile(session);
    const result = await this.database.query<ProfileRow>(`
      UPDATE user_profiles
      SET first_name = $2, last_name = $3, phone = $4, updated_at = now()
      WHERE id = $1
      RETURNING id, oidc_subject, email, email_verified, first_name, last_name, phone, terms_version
    `, [profile.id, input.firstName, input.lastName, input.phone]);
    return result.rows[0]!;
  }

  async listNotifications(session: StudioSession) {
    const profile = await this.ensureProfile(session);
    const result = await this.database.query<AccountNotificationRow>(`
      SELECT id, kind, title, body, read_at, created_at
      FROM account_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [profile.id]);

    return {
      items: result.rows.map((notification) => ({
        id: notification.id,
        kind: notification.kind,
        title: notification.title,
        body: notification.body,
        readAt: notification.read_at?.toISOString() ?? null,
        createdAt: notification.created_at.toISOString()
      }))
    };
  }
}

export function profileResponse(profile: ProfileRow, session: StudioSession) {
  return {
    subject: profile.oidc_subject,
    email: profile.email,
    emailVerified: profile.email_verified,
    roles: session.roles,
    firstName: profile.first_name,
    lastName: profile.last_name,
    phone: profile.phone,
    termsVersion: profile.terms_version,
    profileComplete: Boolean(profile.first_name && profile.last_name && profile.phone)
  };
}

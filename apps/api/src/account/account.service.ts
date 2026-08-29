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

type FavoriteClassTypeRow = {
  created_at: Date;
  difficulty: number;
  hero_image_alt: string;
  hero_image_path: string;
  id: string;
  name: string;
  slug: string;
  tagline: string;
};

@Injectable()
export class AccountService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async ensureProfile(session: StudioSession): Promise<ProfileRow> {
    const result = await this.database.query<ProfileRow>(`
      INSERT INTO user_profiles (oidc_subject, email, email_verified, first_name, last_name)
      VALUES ($1, lower($2), $3, $4, $5)
      ON CONFLICT (oidc_subject) DO UPDATE
      SET email = lower(EXCLUDED.email),
          email_verified = EXCLUDED.email_verified,
          first_name = coalesce(user_profiles.first_name, EXCLUDED.first_name),
          last_name = coalesce(user_profiles.last_name, EXCLUDED.last_name),
          updated_at = now()
      RETURNING id, oidc_subject, email, email_verified, first_name, last_name, phone, terms_version
    `, [session.subject, session.email, session.emailVerified, session.firstName ?? null, session.lastName ?? null]);
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

  async listFavorites(session: StudioSession) {
    const profile = await this.ensureProfile(session);
    const result = await this.database.query<FavoriteClassTypeRow>(`
      SELECT ct.id, ct.name, ct.slug, ct.tagline, ct.difficulty,
        ct.hero_image_path, ct.hero_image_alt, favorite.created_at
      FROM favorite_class_types favorite
      JOIN class_types ct ON ct.id = favorite.class_type_id
      WHERE favorite.user_id = $1 AND ct.active = true
      ORDER BY favorite.created_at DESC, ct.sort_order, ct.name
    `, [profile.id]);
    return { items: result.rows.map(mapFavorite) };
  }

  async addFavorite(session: StudioSession, classTypeId: string) {
    const profile = await this.ensureProfile(session);
    const result = await this.database.query<{ id: string }>(`
      INSERT INTO favorite_class_types (user_id, class_type_id)
      SELECT $1, id FROM class_types WHERE id = $2 AND active = true
      ON CONFLICT (user_id, class_type_id) DO NOTHING
      RETURNING class_type_id AS id
    `, [profile.id, classTypeId]);
    if (result.rowCount) return { id: classTypeId };
    const existing = await this.database.query(
      "SELECT 1 FROM favorite_class_types WHERE user_id = $1 AND class_type_id = $2",
      [profile.id, classTypeId]
    );
    return existing.rowCount ? { id: classTypeId } : undefined;
  }

  async removeFavorite(session: StudioSession, classTypeId: string) {
    const profile = await this.ensureProfile(session);
    await this.database.query(
      "DELETE FROM favorite_class_types WHERE user_id = $1 AND class_type_id = $2",
      [profile.id, classTypeId]
    );
  }
}

function mapFavorite(row: FavoriteClassTypeRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagline: row.tagline,
    difficulty: row.difficulty,
    heroImage: row.hero_image_path ? { src: row.hero_image_path, alt: row.hero_image_alt } : null,
    favoritedAt: row.created_at.toISOString()
  };
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

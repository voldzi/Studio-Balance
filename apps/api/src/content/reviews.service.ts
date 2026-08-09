import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import type { StudioSession } from "../auth/session.js";
import { DatabaseService } from "../database/database.service.js";

export type ReviewInput = {
  authorLabel: string;
  body: string;
  classTypeId: string | null;
  consentConfirmed: boolean;
  featured: boolean;
  published: boolean;
  rating: number | null;
  reviewedOn: string | null;
  sortOrder: number;
  source: string | null;
};

type MutationContext = { requestId: string; session: StudioSession };
type ReviewRow = {
  author_label: string;
  body: string;
  class_type_id: string | null;
  class_type_active: boolean | null;
  class_type_name: string | null;
  class_type_slug: string | null;
  consent_confirmed: boolean;
  created_at: Date;
  featured: boolean;
  id: string;
  published: boolean;
  rating: number | null;
  reviewed_on: string | null;
  sort_order: number;
  source: string | null;
};

const reviewSelect = `
  SELECT r.id, r.author_label, r.body, r.source, r.reviewed_on::text, r.rating,
    r.class_type_id, r.consent_confirmed, r.published, r.featured, r.sort_order,
    r.created_at, ct.active AS class_type_active, ct.name AS class_type_name,
    ct.slug AS class_type_slug
  FROM reviews r
  LEFT JOIN class_types ct ON ct.id = r.class_type_id
`;

@Injectable()
export class ReviewsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listPublic(featuredOnly = false) {
    const result = await this.database.query<ReviewRow>(`${reviewSelect}
      WHERE r.published = true AND ($1::boolean = false OR r.featured = true)
      ORDER BY r.featured DESC, r.sort_order, r.reviewed_on DESC NULLS LAST, r.created_at DESC
      LIMIT $2
    `, [featuredOnly, featuredOnly ? 6 : 100]);
    return { items: result.rows.map(mapPublicReview) };
  }

  async listAdmin() {
    const result = await this.database.query<ReviewRow>(`${reviewSelect}
      ORDER BY r.published DESC, r.featured DESC, r.sort_order, r.created_at DESC
    `);
    return { items: result.rows.map(mapAdminReview) };
  }

  async create(data: ReviewInput, context: MutationContext) {
    return this.database.transaction(async (client) => {
      await this.validateClassType(client, data);
      const result = await client.query<{ id: string }>(`
        INSERT INTO reviews (author_label, body, source, reviewed_on, rating, class_type_id,
          consent_confirmed, published, featured, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `, values(data));
      const id = result.rows[0]!.id;
      await this.audit(client, context, "review.created", id);
      return { id };
    });
  }

  async update(id: string, data: ReviewInput, context: MutationContext) {
    return this.database.transaction(async (client) => {
      const existing = await client.query("SELECT id FROM reviews WHERE id = $1 FOR UPDATE", [id]);
      if (!existing.rowCount) return undefined;

      await this.validateClassType(client, data);
      await client.query(`
        UPDATE reviews SET author_label=$2, body=$3, source=$4, reviewed_on=$5, rating=$6,
          class_type_id=$7, consent_confirmed=$8, published=$9, featured=$10,
          sort_order=$11, updated_at=now()
        WHERE id=$1
      `, [id, ...values(data)]);
      await this.audit(client, context, "review.updated", id);
      return { id };
    });
  }

  private async validateClassType(client: PoolClient, data: ReviewInput) {
    if (!data.classTypeId) return;
    const result = await client.query<{ active: boolean }>(
      "SELECT active FROM class_types WHERE id = $1 FOR SHARE",
      [data.classTypeId]
    );
    const classType = result.rows[0];
    if (!classType || (data.published && !classType.active)) {
      throw new InvalidReviewClassTypeError();
    }
  }

  private audit(client: PoolClient, context: MutationContext, action: string, entityId: string) {
    return client.query(
      "INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id) VALUES ('admin',$1,$2,'review',$3,$4)",
      [context.session.subject, action, entityId, context.requestId]
    );
  }
}

export class InvalidReviewClassTypeError extends Error {
  constructor() {
    super("The selected class type does not exist or is inactive.");
    this.name = "InvalidReviewClassTypeError";
  }
}

function values(data: ReviewInput) {
  return [data.authorLabel, data.body, data.source, data.reviewedOn, data.rating, data.classTypeId,
    data.consentConfirmed, data.published, data.featured, data.sortOrder];
}

function mapPublicReview(row: ReviewRow) {
  return {
    id: row.id,
    authorLabel: row.author_label,
    body: row.body,
    source: row.source,
    reviewedOn: row.reviewed_on,
    rating: row.rating,
    classType: row.class_type_id && row.class_type_active
      ? { id: row.class_type_id, name: row.class_type_name!, slug: row.class_type_slug! }
      : null
  };
}

function mapAdminReview(row: ReviewRow) {
  return {
    ...mapPublicReview(row),
    classTypeId: row.class_type_id,
    consentConfirmed: row.consent_confirmed,
    featured: row.featured,
    published: row.published,
    sortOrder: row.sort_order
  };
}

import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import type { StudioSession } from "../auth/session.js";
import { DatabaseService } from "../database/database.service.js";

export type TransformationInput = {
  afterAssetId: string;
  attribution: string;
  beforeAssetId: string;
  classTypeId: string | null;
  consentConfirmed: boolean;
  featured: boolean;
  published: boolean;
  sortOrder: number;
  story: string;
  title: string;
};

type MutationContext = { requestId: string; session: StudioSession };
type TransformationRow = {
  after_asset_id: string; after_height: number; after_width: number;
  attribution: string; before_asset_id: string; before_height: number; before_width: number;
  class_type_active: boolean | null; class_type_id: string | null; class_type_name: string | null; class_type_slug: string | null;
  consent_confirmed: boolean; featured: boolean; id: string; published: boolean; sort_order: number; story: string; title: string;
};

const select = `
  SELECT t.id,t.title,t.story,t.attribution,t.class_type_id,t.before_asset_id,t.after_asset_id,
    t.consent_confirmed,t.published,t.featured,t.sort_order,
    before_asset.width AS before_width,before_asset.height AS before_height,
    after_asset.width AS after_width,after_asset.height AS after_height,
    ct.active AS class_type_active,ct.name AS class_type_name,ct.slug AS class_type_slug
  FROM client_transformations t
  JOIN media_assets before_asset ON before_asset.id=t.before_asset_id
  JOIN media_assets after_asset ON after_asset.id=t.after_asset_id
  LEFT JOIN class_types ct ON ct.id=t.class_type_id
`;

@Injectable()
export class TransformationsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listPublic(featuredOnly = false) {
    const result = await this.database.query<TransformationRow>(`${select}
      WHERE t.published=true AND t.consent_confirmed=true AND ($1::boolean=false OR t.featured=true)
      ORDER BY t.featured DESC,t.sort_order,t.created_at DESC LIMIT $2
    `, [featuredOnly, featuredOnly ? 6 : 100]);
    return { items: result.rows.map(mapPublic) };
  }

  async listAdmin() {
    const result = await this.database.query<TransformationRow>(`${select} ORDER BY t.published DESC,t.featured DESC,t.sort_order,t.created_at DESC`);
    return { items: result.rows.map(mapAdmin) };
  }

  async create(data: TransformationInput, context: MutationContext) {
    return this.database.transaction(async (client) => {
      await this.validateReferences(client, data);
      const result = await client.query<{ id: string }>(`
        INSERT INTO client_transformations (title,story,attribution,class_type_id,before_asset_id,after_asset_id,consent_confirmed,published,featured,sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
      `, values(data));
      const id = result.rows[0]!.id;
      await this.audit(client, context, "transformation.created", id);
      return { id };
    });
  }

  async update(id: string, data: TransformationInput, context: MutationContext) {
    return this.database.transaction(async (client) => {
      const existing = await client.query("SELECT id FROM client_transformations WHERE id=$1 FOR UPDATE", [id]);
      if (!existing.rowCount) return undefined;
      await this.validateReferences(client, data);
      await client.query(`UPDATE client_transformations SET title=$2,story=$3,attribution=$4,class_type_id=$5,before_asset_id=$6,after_asset_id=$7,consent_confirmed=$8,published=$9,featured=$10,sort_order=$11,updated_at=now() WHERE id=$1`, [id, ...values(data)]);
      await this.audit(client, context, "transformation.updated", id);
      return { id };
    });
  }

  private async validateReferences(client: PoolClient, data: TransformationInput) {
    const assets = await client.query<{ id: string }>("SELECT id FROM media_assets WHERE id=ANY($1::uuid[]) FOR SHARE", [[data.beforeAssetId, data.afterAssetId]]);
    if (assets.rowCount !== 2 || data.beforeAssetId === data.afterAssetId) throw new InvalidTransformationReferenceError();
    if (!data.classTypeId) return;
    const classType = await client.query<{ active: boolean }>("SELECT active FROM class_types WHERE id=$1 FOR SHARE", [data.classTypeId]);
    if (!classType.rows[0] || (data.published && !classType.rows[0].active)) throw new InvalidTransformationReferenceError();
  }

  private audit(client: PoolClient, context: MutationContext, action: string, id: string) {
    return client.query("INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id) VALUES ('admin',$1,$2,'client_transformation',$3,$4)", [context.session.subject, action, id, context.requestId]);
  }
}

export class InvalidTransformationReferenceError extends Error {}

function values(data: TransformationInput) {
  return [data.title,data.story,data.attribution,data.classTypeId,data.beforeAssetId,data.afterAssetId,data.consentConfirmed,data.published,data.featured,data.sortOrder];
}

function mapPublic(row: TransformationRow) {
  return {
    id: row.id,title: row.title,story: row.story,attribution: row.attribution,
    beforeImage: { url: `/api/v1/media/${row.before_asset_id}`, width: row.before_width, height: row.before_height },
    afterImage: { url: `/api/v1/media/${row.after_asset_id}`, width: row.after_width, height: row.after_height },
    classType: row.class_type_id && row.class_type_active ? { id: row.class_type_id,name: row.class_type_name!,slug: row.class_type_slug! } : null
  };
}

function mapAdmin(row: TransformationRow) {
  return { ...mapPublic(row), beforeImage: { url: `/api/v1/admin/media/${row.before_asset_id}`, width: row.before_width, height: row.before_height }, afterImage: { url: `/api/v1/admin/media/${row.after_asset_id}`, width: row.after_width, height: row.after_height }, beforeAssetId: row.before_asset_id, afterAssetId: row.after_asset_id, classTypeId: row.class_type_id, consentConfirmed: row.consent_confirmed, published: row.published, featured: row.featured, sortOrder: row.sort_order };
}

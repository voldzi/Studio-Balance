import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import type { StudioSession } from "../auth/session.js";
import { DatabaseService } from "../database/database.service.js";

export type NewsInput = {
  body: string;
  featured: boolean;
  published: boolean;
  publishedAt: string | null;
  sortOrder: number;
  summary: string;
  title: string;
};

type MutationContext = { requestId: string; session: StudioSession };
type NewsRow = {
  body: string;
  featured: boolean;
  id: string;
  published: boolean;
  published_at: Date | null;
  sort_order: number;
  summary: string;
  title: string;
};

@Injectable()
export class NewsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listPublic() {
    const result = await this.database.query<NewsRow>(`
      SELECT id, title, summary, body, published, featured, published_at, sort_order
      FROM studio_news WHERE published = true AND published_at <= now()
      ORDER BY featured DESC, sort_order, published_at DESC LIMIT 100
    `);
    return { items: result.rows.map(mapPublicNews) };
  }

  async listAdmin() {
    const result = await this.database.query<NewsRow>(`
      SELECT id, title, summary, body, published, featured, published_at, sort_order
      FROM studio_news ORDER BY published DESC, featured DESC, sort_order, created_at DESC
    `);
    return { items: result.rows.map(mapAdminNews) };
  }

  create(data: NewsInput, context: MutationContext) {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string }>(`
        INSERT INTO studio_news (title, summary, body, published, featured, published_at, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
      `, values(data));
      const id = result.rows[0]!.id;
      await audit(client, context, "news.created", id);
      return { id };
    });
  }

  update(id: string, data: NewsInput, context: MutationContext) {
    return this.database.transaction(async (client) => {
      const result = await client.query(`
        UPDATE studio_news SET title=$2, summary=$3, body=$4, published=$5,
          featured=$6, published_at=$7, sort_order=$8, updated_at=now()
        WHERE id=$1 RETURNING id
      `, [id, ...values(data)]);
      if (!result.rowCount) return undefined;
      await audit(client, context, "news.updated", id);
      return { id };
    });
  }
}

function values(data: NewsInput) {
  return [data.title, data.summary, data.body, data.published, data.featured, data.publishedAt, data.sortOrder];
}

function mapPublicNews(row: NewsRow) {
  return { id: row.id, title: row.title, summary: row.summary, body: row.body, publishedAt: row.published_at!.toISOString() };
}

function mapAdminNews(row: NewsRow) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    published: row.published,
    featured: row.featured,
    publishedAt: row.published_at?.toISOString() ?? null,
    sortOrder: row.sort_order
  };
}

function audit(client: PoolClient, context: MutationContext, action: string, entityId: string) {
  return client.query(
    "INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id) VALUES ('admin',$1,$2,'news',$3,$4)",
    [context.session.subject, action, entityId, context.requestId]
  );
}

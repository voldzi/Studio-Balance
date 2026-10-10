import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { StudioSession } from "../auth/session.js";
import { DatabaseService } from "../database/database.service.js";

export type ReviewSubmissionInput = { authorLabel: string; body: string; rating: number | null; consentVersion: string };
type SubmissionStatus = "pending" | "approved" | "rejected";
type SubmissionRow = {
  id: string; author_label: string; body: string; rating: number | null; status: SubmissionStatus;
  created_at: Date; moderated_at: Date | null; moderation_reason: string | null; review_id: string | null;
  consent_version: string; consented_at: Date; payload_hash: string; moderation_payload_hash: string | null;
};
type MutationContext = { requestId: string; session: StudioSession };

@Injectable()
export class ReviewSubmissionsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async submit(data: ReviewSubmissionInput, nonce: string, networkHash: string) {
    const payloadHash = createHash("sha256").update(JSON.stringify([data.authorLabel, data.body, data.rating, data.consentVersion])).digest("hex");
    return databaseAvailable(this.database.transaction(async (client) => {
      // Global acceptance cap is deliberately small. Serialize its counter and
      // nonce replay together, across replicas, so concurrent POSTs cannot exceed it.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('studio_balance_public_review_acceptance'))");
      const existing = await client.query<{ payload_hash: string }>("SELECT payload_hash FROM review_submissions WHERE nonce=$1", [nonce]);
      if (existing.rows[0]) {
        if (existing.rows[0].payload_hash !== payloadHash) throw conflict("REVIEW_SUBMISSION_CONFLICT", "Tento formulář už byl odeslán s jiným obsahem. Otevřete nový formulář.");
        return { status: "pending" as const };
      }
      await client.query(`DELETE FROM review_submission_rate_events WHERE id IN (
        SELECT id FROM review_submission_rate_events WHERE expires_at <= statement_timestamp() ORDER BY expires_at LIMIT 500)`);
      const counts = await client.query<{ total: number; network: number }>(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE network_hash=$1)::int AS network FROM review_submission_rate_events WHERE created_at > statement_timestamp()-interval '1 hour'`, [networkHash]);
      const count = counts.rows[0]!;
      if (count.total >= 200 || count.network >= 30) throw new HttpException({ code: "REVIEW_RATE_LIMITED", message: "Bylo odesláno příliš mnoho recenzí. Zkuste to prosím později." }, HttpStatus.TOO_MANY_REQUESTS);
      await client.query(`INSERT INTO review_submissions (nonce,payload_hash,author_label,body,rating,consent_version,consented_at)
        VALUES ($1,$2,$3,$4,$5,$6,now())`, [nonce,payloadHash,data.authorLabel,data.body,data.rating,data.consentVersion]);
      await client.query("INSERT INTO review_submission_rate_events (network_hash,created_at,expires_at) VALUES ($1,statement_timestamp(),statement_timestamp()+interval '2 hours')", [networkHash]);
      return { status: "pending" as const };
    }));
  }

  async list(status: SubmissionStatus) {
    const result = await databaseAvailable(this.database.query<SubmissionRow>(`SELECT id,author_label,body,rating,status,created_at,
      moderated_at,moderation_reason,review_id,consent_version,consented_at FROM review_submissions WHERE status=$1
      ORDER BY CASE WHEN $1='pending' THEN created_at END ASC, created_at DESC, id LIMIT 100`, [status]));
    const pending = await databaseAvailable(this.database.query<{ count: number }>("SELECT count(*)::int AS count FROM review_submissions WHERE status='pending'"));
    return { items: result.rows.map((row) => ({ id: row.id, authorLabel: row.author_label, body: row.body, rating: row.rating,
      status: row.status, createdAt: row.created_at.toISOString(), moderatedAt: row.moderated_at?.toISOString() ?? null,
      moderationReason: row.moderation_reason, reviewId: row.review_id, consentVersion: row.consent_version, consentedAt: row.consented_at.toISOString() })),
    pendingCount: pending.rows[0]!.count };
  }

  async decide(id: string, data: { decision: "approve" | "reject"; featured: boolean; reason: string | null }, context: MutationContext) {
    const decisionHash = createHash("sha256").update(JSON.stringify([data.decision,data.featured,data.reason])).digest("hex");
    return databaseAvailable(this.database.transaction(async (client) => {
      const result = await client.query<SubmissionRow>("SELECT * FROM review_submissions WHERE id=$1 FOR UPDATE", [id]);
      const row = result.rows[0];
      if (!row) throw new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Recenze nebyla nalezena." }, HttpStatus.NOT_FOUND);
      const status = data.decision === "approve" ? "approved" : "rejected";
      if (row.status !== "pending") {
        if (row.status !== status || row.moderation_payload_hash !== decisionHash) throw conflict("REVIEW_MODERATION_CONFLICT", "Recenze už byla vyřízena jiným způsobem. Obnovte přehled.");
        return { id, status: row.status, reviewId: row.review_id };
      }
      let reviewId: string | null = null;
      if (status === "approved") {
        const published = await client.query<{ id: string }>(`INSERT INTO reviews
          (author_label,body,source,reviewed_on,rating,consent_confirmed,published,featured)
          VALUES ($1,$2,'Web studia',($3::timestamptz AT TIME ZONE 'Europe/Prague')::date,$4,true,true,$5) RETURNING id`,
        [row.author_label,row.body,row.created_at,row.rating,data.featured]);
        reviewId = published.rows[0]!.id;
      }
      await client.query(`UPDATE review_submissions SET status=$2,review_id=$3,moderated_at=now(),moderated_by=$4,moderation_reason=$5,moderation_payload_hash=$6 WHERE id=$1`,
        [id,status,reviewId,context.session.subject,data.reason,decisionHash]);
      await audit(client, context, id, status);
      return { id, status, reviewId };
    }));
  }
}

function conflict(code: string, message: string) { return new HttpException({ code, message }, HttpStatus.CONFLICT); }
function audit(client: PoolClient, context: MutationContext, id: string, status: string) {
  return client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id)
    VALUES ('admin',$1,$2,'review_submission',$3,$4)`, [context.session.subject,`review_submission.${status}`,id,context.requestId]);
}

async function databaseAvailable<Result>(operation: Promise<Result>): Promise<Result> {
  try { return await operation; }
  catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException({ code: "SERVICE_UNAVAILABLE", message: "Recenze jsou dočasně nedostupné. Zkuste to prosím znovu později." }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

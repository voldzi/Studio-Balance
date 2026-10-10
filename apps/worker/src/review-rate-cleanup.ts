import type { Pool } from "pg";

// Accepted contributions are globally capped at 200/hour. A batch of 500 can
// remove all normally expired two-hour data without touching submissions/audit.
export async function deleteExpiredReviewRates(pool: Pick<Pool, "query">): Promise<number> {
  const result = await pool.query(`DELETE FROM review_submission_rate_events WHERE id IN (
    SELECT id FROM review_submission_rate_events WHERE expires_at <= statement_timestamp()
    ORDER BY expires_at LIMIT 500)`);
  return result.rowCount ?? 0;
}

import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { deleteExpiredReviewRates } from "./review-rate-cleanup.js";

describe("anonymous review abuse-data maintenance",()=>{
  it("expires only short-lived throttle records with a bounded delete and no payload logging",async()=>{
    const query=vi.fn(async(text:string)=>{expect(text).not.toContain("review body");return {rowCount:3};});
    expect(await deleteExpiredReviewRates({query} as unknown as Pool)).toBe(3);
    const statement=query.mock.calls[0]?.[0] as unknown as string;
    expect(statement).toContain("DELETE FROM review_submission_rate_events");
    expect(statement).toContain("expires_at <= statement_timestamp()");
    expect(statement).toContain("LIMIT 500");
    expect(statement).not.toContain("review_submissions ");
    expect(statement).not.toContain("application_audit");
  });
  it("does not swallow maintenance failures",async()=>{
    const query=vi.fn(async()=>{throw new Error("unavailable");});
    await expect(deleteExpiredReviewRates({query} as unknown as Pool)).rejects.toThrow("unavailable");
  });
});

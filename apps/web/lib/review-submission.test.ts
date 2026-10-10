import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-types";
import { loadReviewChallenge, ReviewConsentVersionError, reviewSubmissionError, sendReviewDraft, supportedReviewConsentVersion, validateReviewDraft, type ReviewDraft } from "./review-submission";

const draft: ReviewDraft = { authorLabel: "J. K.", body: "Lekce mi pomohla lépe se hýbat.", rating: "", consent: true, website: "" };
const challenge = { token: "opaque-challenge", consentVersion: supportedReviewConsentVersion, expiresAt: "2026-10-10T17:00:00Z" };
afterEach(() => { vi.unstubAllGlobals(); });

describe("client review validation", () => {
  it("accepts initials and an optional empty rating without inventing stars", () => {
    expect(validateReviewDraft(draft)).toEqual({});
    expect(validateReviewDraft({ ...draft, authorLabel: "J", body: "x".repeat(10), rating: "1" })).toEqual({});
    expect(validateReviewDraft({ ...draft, authorLabel: "x".repeat(80), body: "x".repeat(2000), rating: "5" })).toEqual({});
  });
  it.each(["", " ", "x".repeat(81)])("rejects an invalid author label %s", (authorLabel) => {
    expect(validateReviewDraft({ ...draft, authorLabel })).toHaveProperty("authorLabel");
  });
  it.each([" ", "x".repeat(9), "x".repeat(2001)])("rejects an invalid text length", (body) => {
    expect(validateReviewDraft({ ...draft, body })).toHaveProperty("body");
  });
  it.each(["0", "6", "2.5", "01", "<script>"])("rejects an invalid rating %s", (rating) => {
    expect(validateReviewDraft({ ...draft, rating })).toHaveProperty("rating");
  });
  it("requires an affirmative publication consent", () => {
    expect(validateReviewDraft({ ...draft, consent: false })).toHaveProperty("consent");
  });
});

describe("anonymous review transport", () => {
  it("loads an opaque challenge with credentials omitted and no caching", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(challenge), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    expect(await loadReviewChallenge(controller.signal)).toEqual(challenge);
    expect(fetch).toHaveBeenCalledWith("/api/v1/review-submissions/challenge", expect.objectContaining({ credentials: "omit", cache: "no-store", signal: controller.signal }));
  });
  it("sends only consented text, optional rating and the opaque challenge, without an account or contact", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "pending" }), { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    await sendReviewDraft({ ...draft, authorLabel: " J. K. ", body: ` ${draft.body} ` }, challenge);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, options] = fetch.mock.calls[0]!;
    expect(path).toBe("/api/v1/review-submissions");
    expect(options).toMatchObject({ method: "POST", credentials: "omit", cache: "no-store" });
    expect(JSON.parse(options.body)).toEqual({ authorLabel: draft.authorLabel, body: draft.body, rating: null, consent: true, consentVersion: challenge.consentVersion, token: challenge.token, website: "" });
  });
  it("does not retry a failed or rate-limited submission automatically", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "REVIEW_RATE_LIMITED", message: "limit" } }), { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await expect(sendReviewDraft(draft, challenge)).rejects.toMatchObject({ code: "REVIEW_RATE_LIMITED", status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses a changed consent version even when an old bundle still has the previous text", async () => {
    const changed = { ...challenge, consentVersion: "future-consent-version" };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(changed), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(loadReviewChallenge()).rejects.toBeInstanceOf(ReviewConsentVersionError);
    fetch.mockClear();
    await expect(sendReviewDraft(draft, changed)).rejects.toBeInstanceOf(ReviewConsentVersionError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("recoverable review errors", () => {
  it.each(["REVIEW_CHALLENGE_EXPIRED", "REVIEW_CONSENT_VERSION_CHANGED", "REVIEW_SUBMISSION_CONFLICT"])("refreshes only challenge for %s", (code) => {
    const outcome = reviewSubmissionError(new ApiError(code, "internal details", 400));
    expect(outcome.refreshChallenge).toBe(true);
    expect(outcome.message).toContain("znovu stiskněte");
    expect(outcome.message).not.toContain("internal details");
  });
  it("retains the same fresh challenge for a request that was too recent", () => {
    const outcome = reviewSubmissionError(new ApiError("REVIEW_CHALLENGE_TOO_RECENT", "internal", 400));
    expect(outcome.refreshChallenge).toBe(false);
    expect(outcome.message).toContain("počkejte");
  });
  it("preserves the draft across rate limit and network failures", () => {
    for (const error of [new ApiError("REVIEW_RATE_LIMITED", "internal", 429), new Error("network")]) {
      const before = { ...draft };
      const outcome = reviewSubmissionError(error);
      expect(outcome.message).toContain("zůstávají vyplněné");
      expect(outcome.refreshChallenge).toBe(false);
      expect(draft).toEqual(before);
    }
  });
});

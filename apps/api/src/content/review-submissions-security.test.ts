import { createHmac } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { networkPrefix, REVIEW_CHALLENGE_TTL_MS, reviewChallenge, reviewNetworkHash, validateReviewChallenge } from "./review-submissions-security.js";

const secret = "review-test-secret-that-is-long-enough";
const now = 1_800_000_000_000;
describe("anonymous review security", () => {
  it("purpose-signs a 30 minute consent-bound nonce and enforces exact two second minimum", () => {
    const challenge = reviewChallenge(secret, now);
    expect(new Date(challenge.expiresAt).getTime()).toBe(now + REVIEW_CHALLENGE_TTL_MS);
    expect(validateReviewChallenge(challenge.token, secret, now + 1999).status).toBe("too_recent");
    expect(validateReviewChallenge(challenge.token, secret, now + 2000).status).toBe("valid");
    expect(validateReviewChallenge(challenge.token, secret, now + REVIEW_CHALLENGE_TTL_MS - 1).status).toBe("valid");
    expect(validateReviewChallenge(challenge.token, secret, now + REVIEW_CHALLENGE_TTL_MS).status).toBe("expired");
    expect(validateReviewChallenge(challenge.token, "different-secret", now + 2000).status).toBe("invalid");
    expect(validateReviewChallenge(`${challenge.token}x`, secret, now + 2000).status).toBe("invalid");
  });
  it("rejects tokens signed for another purpose and recognizes previously signed consent versions", () => {
    const base = reviewChallenge(secret, now).token.split(".")[0]!;
    const original = JSON.parse(Buffer.from(base,"base64url").toString("utf8"));
    const signed = (payload: object) => {
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = createHmac("sha256",secret).update("studio-balance:review-challenge:v1\0").update(encoded).digest("base64url");
      return `${encoded}.${signature}`;
    };
    expect(validateReviewChallenge(signed({ ...original,purpose:"password-reset" }),secret,now+2000).status).toBe("invalid");
    expect(validateReviewChallenge(signed({ ...original,consentVersion:"old-consent" }),secret,now+2000).status).toBe("consent_changed");
  });
  it("normalizes network prefixes without browser identity or raw IP storage", () => {
    expect(networkPrefix("192.0.2.4")).toBe("192.0.2.0/24");
    expect(networkPrefix("::ffff:192.0.2.4")).toBe("192.0.2.0/24");
    expect(networkPrefix("2001:db8:abcd:12ab::1")).toBe("2001:db8:abcd:1200::/56");
    expect(networkPrefix("2001:0db8:abcd:12ff:0:0:0:2")).toBe("2001:db8:abcd:1200::/56");
    expect(networkPrefix("bad, input")).toBe("unknown-network");
  });
  it("uses only a single DMZ overwritten production header and ignores spoofing in development", () => {
    const base = loadRuntimeConfig({ APP_ENV:"test",SESSION_SECRET:secret });
    const request = (forwarded: string) => ({ headers:{"x-forwarded-for":forwarded},raw:{socket:{remoteAddress:"192.0.2.1"}},ip:"192.0.2.1" }) as unknown as FastifyRequest;
    const hash = reviewNetworkHash(request("198.51.100.2"),base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(reviewNetworkHash(request("198.51.100.3"),base)).toBe(hash);
    const production = { ...base,environment:"production" as const };
    expect(reviewNetworkHash(request("198.51.100.2"),production)).not.toBe(hash);
    expect(reviewNetworkHash(request("198.51.100.2, 203.0.113.9"),production)).toBe(hash);
  });
  it("requires canonical public URL configuration without credentials, paths, query or fragments", () => {
    for (const url of ["https://user:password@example.test", "https://example.test/recenze", "https://example.test/?token=private", "https://example.test/#x", "ftp://example.test"]) {
      expect(()=>loadRuntimeConfig({ APP_ENV:"test",PUBLIC_APP_URL:url })).toThrow("canonical application origin");
    }
    expect(loadRuntimeConfig({APP_ENV:"test",PUBLIC_APP_URL:"https://studio.example.test/"}).publicAppUrl).toBe("https://studio.example.test");
  });
});

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { RuntimeConfig } from "../config/runtime-config.js";

export const REVIEW_CONSENT_VERSION = "reviews-public-v1-2026-10-10";
export const REVIEW_CHALLENGE_TTL_MS = 30 * 60 * 1000;
const tokenSchema = z.object({
  purpose: z.literal("review-submission-v1"), nonce: z.string().uuid(),
  issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(),
  consentVersion: z.string().min(1).max(100)
}).strict();

export function reviewChallenge(secret: string, now = Date.now()) {
  const payload = { purpose: "review-submission-v1", nonce: randomUUID(), issuedAt: now,
    expiresAt: now + REVIEW_CHALLENGE_TTL_MS, consentVersion: REVIEW_CONSENT_VERSION };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${signature(secret, encoded)}`, consentVersion: REVIEW_CONSENT_VERSION,
    expiresAt: new Date(payload.expiresAt).toISOString() };
}

export function validateReviewChallenge(token: string, secret: string, now = Date.now()) {
  if (token.length > 1000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return { status: "invalid" as const };
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) return { status: "invalid" as const };
  const expected = Buffer.from(signature(secret, encoded));
  const received = Buffer.from(supplied);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return { status: "invalid" as const };
  try {
    const parsed = tokenSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (!parsed.success) return { status: "invalid" as const };
    const payload = parsed.data;
    if (payload.expiresAt - payload.issuedAt !== REVIEW_CHALLENGE_TTL_MS) return { status: "invalid" as const };
    if (payload.consentVersion !== REVIEW_CONSENT_VERSION) return { status: "consent_changed" as const };
    if (now < payload.issuedAt + 2000) return { status: "too_recent" as const };
    if (now >= payload.expiresAt) return { status: "expired" as const };
    return { status: "valid" as const, payload };
  } catch { return { status: "invalid" as const }; }
}

function signature(secret: string, encoded: string) {
  return createHmac("sha256", secret).update("studio-balance:review-challenge:v1\0").update(encoded).digest("base64url");
}

// The DMZ explicitly overwrites this header with a single $remote_addr. Do not
// enable global proxy trust: it would affect unrelated authorization paths.
export function reviewNetworkHash(request: FastifyRequest, config: RuntimeConfig) {
  const forwarded = request.headers["x-forwarded-for"];
  const address = config.environment === "production" && typeof forwarded === "string" && isIP(forwarded)
    ? forwarded : request.raw.socket.remoteAddress ?? request.ip;
  const normalized = networkPrefix(address);
  return createHmac("sha256", config.sessionSecret).update("studio-balance:review-network:v1\0").update(normalized).digest("hex");
}

export function networkPrefix(address: string) {
  if (address.startsWith("::ffff:") && isIP(address.slice(7)) === 4) address = address.slice(7);
  if (isIP(address) === 4) return `${address.split(".").slice(0, 3).join(".")}.0/24`;
  if (isIP(address) !== 6) return "unknown-network";
  let expanded = address.toLowerCase();
  if (expanded.includes(".")) {
    const split = expanded.lastIndexOf(":");
    const bytes = expanded.slice(split + 1).split(".").map(Number);
    expanded = `${expanded.slice(0, split)}:${((bytes[0]! << 8) + bytes[1]!).toString(16)}:${((bytes[2]! << 8) + bytes[3]!).toString(16)}`;
  }
  const [left = "", right = ""] = expanded.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const groups = expanded.includes("::") ? [...start, ...Array<string>(8 - start.length - end.length).fill("0"), ...end] : start;
  const prefix = groups.slice(0, 3).map((part) => Number.parseInt(part, 16).toString(16));
  prefix.push((Number.parseInt(groups[3]!, 16) & 0xff00).toString(16));
  return `${prefix.join(":")}::/56`;
}

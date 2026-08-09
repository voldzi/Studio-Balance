import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../database/database.service.js";
import { InvalidReviewClassTypeError, ReviewsService, type ReviewInput } from "./reviews.service.js";

const input: ReviewInput = {
  authorLabel: "Jana",
  body: "Ověřená zkušenost klientky s lekcí.",
  classTypeId: null,
  consentConfirmed: true,
  featured: true,
  published: true,
  rating: 5,
  reviewedOn: "2026-08-08",
  sortOrder: 10,
  source: "Předáno zadavatelkou"
};

describe("ReviewsService", () => {
  it("maps only public review fields and requests featured approved rows", async () => {
    const query = vi.fn(async () => ({ rows: [{
      id: "11111111-1111-4111-8111-111111111111", author_label: "Jana", body: input.body,
      source: input.source, reviewed_on: input.reviewedOn, rating: 5, class_type_id: null,
      class_type_active: null, class_type_name: null, class_type_slug: null,
      consent_confirmed: true, published: true,
      featured: true, sort_order: 10, created_at: new Date()
    }] }));
    const service = new ReviewsService({ query } as unknown as DatabaseService);
    const result = await service.listPublic(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("r.published = true"), [true, 6]);
    expect(result.items[0]).toEqual({
      id: "11111111-1111-4111-8111-111111111111", authorLabel: "Jana", body: input.body,
      source: input.source, reviewedOn: input.reviewedOn, rating: 5, classType: null
    });
    expect(result.items[0]).not.toHaveProperty("consentConfirmed");
  });

  it("writes the review and its minimal audit record through one transaction client", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }] })
      .mockResolvedValueOnce({ rows: [] });
    const transaction = vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }));
    const databaseQuery = vi.fn();
    const service = new ReviewsService({ query: databaseQuery, transaction } as unknown as DatabaseService);
    await service.create(input, { requestId: "request-1", session: { subject: "admin-1", email: "admin@example.test", emailVerified: true, roles: ["admin"] } });
    expect(transaction).toHaveBeenCalledOnce();
    expect(databaseQuery).not.toHaveBeenCalled();
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("application_audit"), ["admin-1", "review.created", "11111111-1111-4111-8111-111111111111", "request-1"]);
    expect(JSON.stringify(query.mock.calls[1])).not.toContain(input.body);
  });

  it("reports an unknown review without writing an audit", async () => {
    const query = vi.fn(async () => ({ rowCount: 0, rows: [] }));
    const transaction = vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }));
    const service = new ReviewsService({ transaction } as unknown as DatabaseService);
    const result = await service.update("11111111-1111-4111-8111-111111111111", input, { requestId: "request-1", session: { subject: "admin-1", email: "admin@example.test", emailVerified: true, roles: ["admin"] } });
    expect(result).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("writes an update and its audit record through one transaction client", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "11111111-1111-4111-8111-111111111111" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const transaction = vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }));
    const databaseQuery = vi.fn();
    const service = new ReviewsService({ query: databaseQuery, transaction } as unknown as DatabaseService);

    await expect(service.update("11111111-1111-4111-8111-111111111111", input, {
      requestId: "request-1",
      session: { subject: "admin-1", email: "admin@example.test", emailVerified: true, roles: ["admin"] }
    })).resolves.toEqual({ id: "11111111-1111-4111-8111-111111111111" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(databaseQuery).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("application_audit"), [
      "admin-1", "review.updated", "11111111-1111-4111-8111-111111111111", "request-1"
    ]);
  });

  it.each([
    ["missing", []],
    ["inactive", [{ active: false }]]
  ])("rejects a %s class type before publishing", async (_case, rows) => {
    const query = vi.fn(async () => ({ rowCount: rows.length, rows }));
    const transaction = vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }));
    const service = new ReviewsService({ transaction } as unknown as DatabaseService);
    const classTypeInput = { ...input, classTypeId: "22222222-2222-4222-8222-222222222222" };

    await expect(service.create(classTypeInput, {
      requestId: "request-1",
      session: { subject: "admin-1", email: "admin@example.test", emailVerified: true, roles: ["admin"] }
    })).rejects.toBeInstanceOf(InvalidReviewClassTypeError);
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM class_types"), [classTypeInput.classTypeId]);
  });

  it("allows an existing inactive class type on an unpublished draft", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ active: false }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "11111111-1111-4111-8111-111111111111" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const transaction = vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }));
    const service = new ReviewsService({ transaction } as unknown as DatabaseService);

    await expect(service.create({
      ...input,
      classTypeId: "22222222-2222-4222-8222-222222222222",
      published: false
    }, {
      requestId: "request-1",
      session: { subject: "admin-1", email: "admin@example.test", emailVerified: true, roles: ["admin"] }
    })).resolves.toEqual({ id: "11111111-1111-4111-8111-111111111111" });
    expect(query).toHaveBeenCalledTimes(3);
  });
});

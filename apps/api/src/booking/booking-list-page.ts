import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import { z } from "zod";

const calendarDate = z.iso.date().refine((value) => !value.startsWith("0000"));
const instant = z.iso.datetime().refine((value) => !value.startsWith("0000"));

export const bookingPageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(),
  from: calendarDate.optional(), through: calendarDate.optional()
});
export type BookingPageQuery = z.infer<typeof bookingPageSchema>;
export type BookingPeriod = "all" | "upcoming" | "history";
const cursorSchema = z.object({ v: z.literal(1), scope: z.string().length(64),
  start: instant, id: z.string().uuid(), asOf: instant }).strict();

export function parseBookingPage<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw invalidPage();
  return result.data;
}

/** The cursor is not an authority: every query retains its actor/object filters. */
export function bookingPage(query: BookingPageQuery, scope: object, ascending = false) {
  if (query.from && query.through && query.through < query.from) throw invalidPage();
  const scopeHash = createHash("sha256").update(JSON.stringify(scope)).digest("hex");
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (query.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))); }
    catch { throw invalidPage(); }
    if (cursor.scope !== scopeHash) throw invalidPage();
  }
  const limit = query.limit ?? 50;
  const asOf = cursor?.asOf ?? new Date().toISOString();
  return {
    limit, asOf, direction: ascending ? "ASC" : "DESC", cursor,
    predicates(values: unknown[]): string[] {
      const clauses: string[] = [];
      const param = (value: unknown) => { values.push(value); return `$${values.length}`; };
      if (query.from) clauses.push(`s.start_at >= (${param(query.from)}::date::timestamp AT TIME ZONE 'Europe/Prague')`);
      if (query.through) clauses.push(`s.start_at < ((${param(query.through)}::date + 1)::timestamp AT TIME ZONE 'Europe/Prague')`);
      if (cursor) clauses.push(`(s.start_at,b.id) ${ascending ? ">" : "<"} (${param(cursor.start)}::timestamptz,${param(cursor.id)}::uuid)`);
      return clauses;
    },
    nextCursor(rows: { cursor_start_at: string; id: string }[]): string | null {
      if (rows.length <= limit) return null;
      const last = rows[limit - 1]!;
      return Buffer.from(JSON.stringify({ v: 1, scope: scopeHash, start: last.cursor_start_at, id: last.id, asOf })).toString("base64url");
    }
  };
}

function invalidPage() {
  return new HttpException({ code: "VALIDATION_ERROR", message: "Zvolte platné období rezervací nebo načtěte seznam znovu." }, HttpStatus.BAD_REQUEST);
}

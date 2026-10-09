import { HttpException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { StudioSession } from "../auth/session.js";
import type { MutationContext } from "./admin.service.js";
import { AdminService } from "./admin.service.js";
import type { DatabaseService } from "../database/database.service.js";
import { applyAttendanceWithClient, type AttendanceBookingRow } from "./attendance-mutation.js";

const context: MutationContext = { requestId: "attendance-test", session: { subject: "admin" } as StudioSession };
const booking: AttendanceBookingRow = { id: "booking", user_id: "owner", status: "reserved", price_snapshot_cents: 16000 };
type Fee = { id: string; status: string; amount_cents: number; settlement_method?: string | null; settled_at?: string | null };

function fixture(status: string, fee?: Fee) {
  const row = { ...booking, status };
  const storedFee = fee ? { ...fee } : undefined;
  const audits: Record<string, unknown>[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT id,status,amount_cents")) return { rows: storedFee ? [{ ...storedFee }] : [] };
    if (sql.startsWith("UPDATE bookings")) row.status = values[1] as string;
    if (sql.startsWith("UPDATE cancellation_fees")) {
      if (sql.includes("SET status='cancelled'")) storedFee!.status = "cancelled";
      else storedFee!.status = "due";
    }
    if (sql.startsWith("INSERT INTO application_audit")) audits.push(values[3] as Record<string, unknown>);
    return { rows: [], rowCount: 1 };
  });
  return { row, fee: storedFee, query, audits, client: { query } as unknown as PoolClient };
}

describe("attendance fee corrections", () => {
  it("creates one no-show fee from the individual booking price and audits the change", async () => {
    const state = fixture("reserved");
    expect(await applyAttendanceWithClient(state.client, { ...state.row }, "no_show", "Nepřišla.", context)).toEqual({ id: booking.id, status: "no_show" });
    expect(state.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO cancellation_fees"), [booking.id, booking.user_id, 16000]);
    expect(state.audits).toEqual([expect.objectContaining({ from: "reserved", to: "no_show", reason: "Nepřišla.", feeChange: "created", feeAmountCents: 16000 })]);
    expect(state.query.mock.calls.findIndex(([sql]) => sql.startsWith("SELECT id,status"))).toBeLessThan(state.query.mock.calls.findIndex(([sql]) => sql.startsWith("UPDATE bookings")));
  });

  it("reverses due no-show then restores the same fee without overwriting its price", async () => {
    const state = fixture("no_show", { id: "fee", status: "due", amount_cents: 20000 });
    await applyAttendanceWithClient(state.client, { ...state.row }, "attended", "Oprava docházky.", context);
    expect(state.fee).toMatchObject({ status: "cancelled", amount_cents: 20000 });
    await applyAttendanceWithClient(state.client, { ...state.row }, "no_show", "Oprava docházky zpět.", context);
    expect(state.fee).toMatchObject({ status: "due", amount_cents: 20000 });
    const feeWrites = state.query.mock.calls.filter(([sql]) => sql.startsWith("UPDATE cancellation_fees"));
    expect(feeWrites).toHaveLength(2);
    expect(feeWrites.every(([sql]) => !sql.includes("amount_cents=") && !sql.includes("settled_at="))).toBe(true);
    expect(state.audits).toEqual([
      expect.objectContaining({ from: "no_show", to: "attended", feeChange: "cancelled", previousFeeStatus: "due", feeAmountCents: 20000 }),
      expect.objectContaining({ from: "attended", to: "no_show", feeChange: "reactivated", previousFeeStatus: "cancelled", feeAmountCents: 20000 })
    ]);
  });

  it.each([
    { id: "fee", status: "settled", amount_cents: 20000, settlement_method: "cash", settled_at: "2026-10-09T10:00:00Z" },
    { id: "fee", status: "waived", amount_cents: 20000, settlement_method: null, settled_at: null }
  ])("preserves $status fees and their financial history through both corrections", async (fee) => {
    const state = fixture("no_show", fee);
    await applyAttendanceWithClient(state.client, { ...state.row }, "attended", "Oprava.", context);
    await applyAttendanceWithClient(state.client, { ...state.row }, "no_show", "Další oprava.", context);
    expect(state.fee).toEqual(fee);
    expect(state.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE cancellation_fees") || sql.startsWith("INSERT INTO cancellation_fees"))).toBe(false);
    expect(state.audits).toHaveLength(2);
    expect(state.audits.every((audit) => audit.feeChange === null && audit.previousFeeStatus === fee.status)).toBe(true);
  });

  it("does not reprice an already due fee when changing reserved to no-show", async () => {
    const state = fixture("reserved", { id: "fee", status: "due", amount_cents: 12000 });
    await applyAttendanceWithClient(state.client, { ...state.row }, "no_show", "Nepřišla.", context);
    expect(state.fee).toEqual({ id: "fee", status: "due", amount_cents: 12000 });
    expect(state.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE cancellation_fees"))).toBe(false);
  });

  it.each(["attended", "no_show"] as const)("repeating %s performs no writes, fee resurrection or extra audit", async (status) => {
    const state = fixture(status, { id: "fee", status: "waived", amount_cents: 20000 });
    expect(await applyAttendanceWithClient(state.client, { ...state.row }, status, "Dvojklik.", context)).toEqual({ id: booking.id, status });
    expect(state.query).not.toHaveBeenCalled();
  });

  it.each(["cancelled_on_time", "cancelled_late", "cancelled_by_studio"])("never resurrects a %s booking", async (status) => {
    const state = fixture(status);
    for (const next of ["attended", "no_show"] as const) {
      const result = applyAttendanceWithClient(state.client, { ...state.row }, next, "Neplatná oprava.", context);
      await expect(result).rejects.toBeInstanceOf(HttpException);
      await expect(result).rejects.toMatchObject({ status: 409, response: { code: "STATE_CONFLICT" } });
    }
    expect(state.row.status).toBe(status);
    expect(state.query).not.toHaveBeenCalled();
  });
});


describe("single attendance session guards", () => {
  const now = new Date("2026-10-09T10:00:00Z");
  function serviceFor(startAt: Date, sessionStatus = "scheduled") {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT session_id")) return { rows: [{ session_id: "lesson" }] };
      if (sql.startsWith("SELECT booking.id")) return { rows: [{ ...booking, session_start_at: startAt, session_status: sessionStatus }] };
      return { rows: [] };
    });
    const service = new AdminService({ transaction: (fn: (client: PoolClient) => Promise<unknown>) => fn({ query } as unknown as PoolClient) } as unknown as DatabaseService);
    return { service, query };
  }

  it.each(["attended", "no_show"] as const)("rejects premature %s before start without financial writes", async (status) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const { service, query } = serviceFor(new Date(now.getTime() + 1));
      await expect(service.attendance(booking.id, status, "Docházka.", context)).rejects.toMatchObject({ status: 409, response: { code: "STATE_CONFLICT" } });
      expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT"))).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it.each(["attended", "no_show"] as const)("allows %s at the exact session start", async (status) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const { service, query } = serviceFor(now);
      expect(await service.attendance(booking.id, status, "Docházka.", context)).toEqual({ id: booking.id, status });
      const statements = query.mock.calls.map(([sql]) => sql);
      expect(statements.findIndex((sql) => sql.startsWith("SELECT id FROM class_sessions"))).toBeLessThan(statements.findIndex((sql) => sql.startsWith("SELECT booking.id")));
      expect(statements.some((sql) => sql.startsWith("INSERT INTO application_audit"))).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it.each(["attended", "no_show"] as const)("allows %s corrections for a completed lesson", async (status) => {
    const { service, query } = serviceFor(new Date(0), "completed");
    expect(await service.attendance(booking.id, status, "Oprava docházky odučené lekce.", context)).toEqual({ id: booking.id, status });
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO application_audit"))).toBe(true);
  });

  it("rejects cancelled lessons without financial writes", async () => {
    const { service, query } = serviceFor(new Date(0), "cancelled");
    await expect(service.attendance(booking.id, "attended", "Oprava.", context)).rejects.toMatchObject({ status: 409, response: { code: "STATE_CONFLICT" } });
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT"))).toBe(false);
  });
});

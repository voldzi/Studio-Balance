import { HttpException, HttpStatus } from "@nestjs/common";
import type { PoolClient } from "pg";

import type { MutationContext } from "./admin.service.js";

export type AttendanceBookingRow = {
  id: string;
  user_id: string;
  status: string;
  price_snapshot_cents: number;
};

type AttendanceStatus = "attended" | "no_show";
type FeeRow = { id: string; status: string; amount_cents: number };

/** Caller holds the session-first and booking row locks inside one transaction. */
export async function applyAttendanceWithClient(
  client: PoolClient,
  row: AttendanceBookingRow,
  status: AttendanceStatus,
  reason: string,
  context: MutationContext
): Promise<{ id: string; status: AttendanceStatus }> {
  if (!["reserved", "attended", "no_show"].includes(row.status)) {
    throw new HttpException({ code: "STATE_CONFLICT", message: "Docházku lze upravit jen u platné nezrušené rezervace." }, HttpStatus.CONFLICT);
  }
  if (row.status === status) return { id: row.id, status };

  const fee = (await client.query<FeeRow>(
    "SELECT id,status,amount_cents FROM cancellation_fees WHERE booking_id=$1 FOR UPDATE", [row.id]
  )).rows[0];

  await client.query("UPDATE bookings SET status=$2,updated_at=now() WHERE id=$1", [row.id, status]);
  let feeChange: "created" | "reactivated" | "cancelled" | null = null;
  if (status === "no_show") {
    if (!fee) {
      await client.query(`INSERT INTO cancellation_fees (booking_id,user_id,amount_cents)
        VALUES ($1,$2,$3) ON CONFLICT (booking_id) DO NOTHING`, [row.id, row.user_id, row.price_snapshot_cents]);
      feeChange = "created";
    } else if (fee.status === "cancelled") {
      // Reversing an attendance correction restores the original fee, never a new price.
      await client.query("UPDATE cancellation_fees SET status='due',updated_at=now() WHERE id=$1 AND status='cancelled'", [fee.id]);
      feeChange = "reactivated";
    }
  } else if (fee?.status === "due") {
    await client.query("UPDATE cancellation_fees SET status='cancelled',updated_at=now() WHERE id=$1 AND status='due'", [fee.id]);
    feeChange = "cancelled";
  }

  // Settled and waived fees retain their amount, settlement details and disposition.
  await client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id,metadata)
    VALUES ('admin',$1,'booking.attendance_changed','booking',$2,$3,$4)`, [
    context.session.subject, row.id, context.requestId,
    { from: row.status, to: status, reason, feeChange, previousFeeStatus: fee?.status ?? null,
      feeAmountCents: fee?.amount_cents ?? (status === "no_show" ? row.price_snapshot_cents : null) }
  ]);
  return { id: row.id, status };
}

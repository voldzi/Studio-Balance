import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../database/database.service.js";
import { AdminService } from "./admin.service.js";

describe("AdminService dashboard", () => {
  it("maps attendance analytics and keeps the financial value explicitly estimated", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "30000000-0000-4000-8000-000000000001", start_at: new Date(), status: "scheduled", capacity: 8, class_name: "TRX", instructor_name: "Nicola Lojšková", booking_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: "4" }] })
      .mockResolvedValueOnce({ rows: [{ count: "12" }] })
      .mockResolvedValueOnce({ rows: [{ reservations_this_week: "7", attended_this_month: "5", no_shows_this_month: "1", late_cancellations_this_month: "2", attended_90_days: "9", no_shows_90_days: "1", estimated_attended_value_this_month_cents: "80000" }] })
      .mockResolvedValueOnce({ rows: [{ class_type_id: "20000000-0000-4000-8000-000000000002", class_name: "TRX", reservations: 7, attended: 5 }] })
      .mockResolvedValueOnce({ rows: [{ week_start: "2026-08-24", attended: 5 }] });
    const service = new AdminService({ query } as unknown as DatabaseService);

    const dashboard = await service.dashboard();

    expect(dashboard).toMatchObject({
      activeBookings: 4,
      clients: 12,
      metrics: {
        attendanceRate90Days: 90,
        attendedThisMonth: 5,
        estimatedAttendedValueThisMonthCents: 80000,
        lateCancellationsThisMonth: 2,
        noShowsThisMonth: 1,
        reservationsThisWeek: 7
      },
      classPopularity: [{ className: "TRX", reservations: 7, attended: 5 }],
      weeklyAttendance: [{ weekStart: "2026-08-24", attended: 5 }]
    });
    expect(query).toHaveBeenCalledTimes(6);
  });

  it("uses an empty attendance rate when no attendance decision exists", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ reservations_this_week: "0", attended_this_month: "0", no_shows_this_month: "0", late_cancellations_this_month: "0", attended_90_days: "0", no_shows_90_days: "0", estimated_attended_value_this_month_cents: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new AdminService({ query } as unknown as DatabaseService);

    expect((await service.dashboard()).metrics.attendanceRate90Days).toBeNull();
  });
});

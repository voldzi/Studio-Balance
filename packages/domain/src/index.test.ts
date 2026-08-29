import { describe, expect, it } from "vitest";

import { cancellationMode, publicSessionLabel, sessionAvailability, STUDIO_TIME_ZONE } from "./index.js";

describe("public session presentation", () => {
  it("uses the binding studio timezone", () => {
    expect(STUDIO_TIME_ZONE).toBe("Europe/Prague");
  });

  it("does not reveal a numeric remaining-place count", () => {
    expect(publicSessionLabel("full")).toBe("Lekce je obsazena");
  });
});

describe("sessionAvailability", () => {
  const base = {
    activeBookings: 2,
    bookingClosesAt: new Date("2026-08-05T14:30:00Z"),
    bookingOpensAt: new Date("2026-07-06T15:00:00Z"),
    capacity: 8,
    endAt: new Date("2026-08-05T16:00:00Z"),
    now: new Date("2026-08-05T14:00:00Z"),
    startAt: new Date("2026-08-05T15:00:00Z"),
    status: "scheduled" as const
  };

  it("returns only a public availability state", () => {
    expect(sessionAvailability(base)).toBe("bookable");
    expect(sessionAvailability({ ...base, activeBookings: 8 })).toBe("full");
  });

  it("closes at the exact configured instant", () => {
    expect(sessionAvailability({ ...base, now: base.bookingClosesAt })).toBe("closed");
  });
});

describe("cancellationMode", () => {
  const cutoffAt = new Date("2026-08-04T15:00:00Z");

  it("treats the exact cutoff as on time", () => {
    expect(cancellationMode({ cutoffAt, now: cutoffAt })).toBe("on_time");
  });

  it("treats one millisecond after cutoff as late", () => {
    expect(cancellationMode({ cutoffAt, now: new Date(cutoffAt.getTime() + 1) })).toBe("late");
  });

  it("honours a free cancellation window", () => {
    expect(
      cancellationMode({
        cutoffAt,
        now: new Date("2026-08-05T10:00:00Z"),
        freeCancellationUntil: new Date("2026-08-05T11:00:00Z")
      })
    ).toBe("free_change_window");
  });
});

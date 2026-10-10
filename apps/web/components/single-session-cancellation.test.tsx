import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cancellableSessionsOnDate, sameCancellationPreview, SingleSessionCancellation, studioSessionDate, type CancellationSession } from "./single-session-cancellation";

const session: CancellationSession = { id: "friday", classTypeId: "latino", className: "Latino Ladies", instructorId: "xavier", instructorName: "Xavier Tihelka", startAt: "2026-11-06T16:30:00Z", endAt: "2026-11-06T17:30:00Z", status: "scheduled", bookingCount: 2 };
const props = { sessions: [session], busy: false, onAuthRequired: () => undefined, onCancelled: async () => undefined };

describe("one-off session cancellation", () => {
  it("uses the studio day across midnight and the Prague DST boundary", () => {
    expect(studioSessionDate("2026-10-24T22:30:00Z")).toBe("2026-10-25");
    expect(studioSessionDate("2026-10-25T23:30:00Z")).toBe("2026-10-26");
    expect(studioSessionDate("2026-03-28T23:30:00Z")).toBe("2026-03-29");
  });
  it("offers all future scheduled sessions for the selected day, independently of booking availability", () => {
    const earlier = { ...session, id: "early", startAt: "2026-11-06T07:00:00Z" };
    const items = [session, { ...session, id: "cancelled", status: "cancelled" }, { ...session, id: "other-day", startAt: "2026-11-08T17:00:00Z" }, earlier];
    expect(cancellableSessionsOnDate(items, "2026-11-06", Date.parse("2026-10-10T10:00:00Z")).map((item) => item.id)).toEqual(["early", "friday"]);
    expect(cancellableSessionsOnDate([session], "2026-11-06", Date.parse(session.startAt))).toEqual([]);
  });
  it.each([
    { id: "different" }, { classTypeId: "other" }, { className: "TRX" },
    { instructorId: "substitute" }, { instructorName: "Substitute" },
    { startAt: "2026-11-06T17:30:00Z" }, { endAt: "2026-11-06T18:30:00Z" },
    { status: "cancelled" }, { bookingCount: 3 }
  ])("requires a fresh confirmation when a preview field changes: %j", (change) => {
    expect(sameCancellationPreview(session, { ...session, ...change })).toBe(false);
  });
  it("accepts equivalent instants expressed with different offsets", () => {
    expect(sameCancellationPreview(session, { ...session, startAt: "2026-11-06T17:30:00+01:00", endAt: "2026-11-06T18:30:00+01:00" })).toBe(true);
  });
  it("opens the row action with the exact date, instructor and an unconfirmed, explained impact", () => {
    const html = renderToStaticMarkup(<SingleSessionCancellation {...props} initialSession={session} />);
    expect(html).toContain('value="2026-11-06"');
    expect(html).toContain("Xavier Tihelka");
    expect(html).toContain("17:30–18:30");
    expect(html).toContain("Aktuálně 2");
    expect(html).toContain("ve svém účtu");
    expect(html).toContain("bez storno poplatku");
    expect(html).not.toContain('checked=""');
    expect(html).toMatch(/type="submit" disabled=""/);
  });
  it("keeps the date and confirmation disabled while the enclosing administration is busy", () => {
    const html = renderToStaticMarkup(<SingleSessionCancellation {...props} initialSession={session} busy />);
    expect(html).toMatch(/type="date"[^>]*disabled=""/);
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
  });
});

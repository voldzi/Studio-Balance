import { describe, expect, it } from "vitest";
import { instructorRecordsCsv, studioInstant, studioMonth, type InstructorReport } from "./instructor-records";

describe("operational instructor records", () => {
  it("uses the Prague calendar month even at the UTC month boundary", () => {
    expect(studioMonth(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10");
    expect(studioMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });
  it("resolves winter/summer timestamps independently of browser timezone", () => {
    expect(studioInstant("2026-10-08T17:00")).toBe("2026-10-08T15:00:00.000Z");
    expect(studioInstant("2026-11-05T17:00")).toBe("2026-11-05T16:00:00.000Z");
    expect(() => studioInstant("2026-03-29T02:30")).toThrow("neexistuje");
    expect(() => studioInstant("2026-10-25T02:30")).toThrow("nejednoznačný");
    expect(studioInstant("2026-10-25T02:30", "2026-10-25T01:30:00Z")).toBe("2026-10-25T01:30:00.000Z");
    expect(() => studioInstant("2026-02-31T12:00")).toThrow();
  });
  it("exports Czech values, distinguishes missing rewards and neutralizes spreadsheet formulas", () => {
    const report: InstructorReport = { month: "2026-10", timeZone: "Europe/Prague", unconfirmedSessions: [], summary: [{ instructorId: "i", instructorName: "=SUM(A1)", lessons: 1, minutes: 60, rewardCents: 0, pendingRewards: 1 }], records: [{ id: "r", sessionId: "s", instructorId: "i", instructorName: "=SUM(A1)", className: '  @bad;"quoted"', startAt: "2026-10-08T15:00:00Z", endAt: "2026-10-08T16:00:00Z", minutes: 60, rewardCents: null, participants: 12, version: 1, attendanceChanged: true, confirmedAt: "2026-10-08T16:05:00Z", updatedAt: "2026-10-08T16:05:00Z" }] };
    const csv = instructorRecordsCsv(report);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=SUM(A1)"');
    expect(csv).toContain('"\'  @bad;""quoted"""');
    expect(csv).toContain('"17:00";"18:00";"1";"12";"K doplnění"');
    expect(csv).toContain("zadaných odměn");
    expect(csv).toContain("Docházka se změnila");
    expect(csv).not.toContain("vyplaceno");
  });
  it("exports unconfirmed lessons separately without fabricated hours or reward", () => {
    const report: InstructorReport = { month: "2026-10", timeZone: "Europe/Prague", summary: [], records: [], unconfirmedSessions: [{ id: "s", instructorId: "i", instructorName: "Instruktor", className: "Nepotvrzená lekce", startAt: "2026-10-08T15:00:00Z", endAt: "2026-10-08T16:00:00Z", status: "scheduled" }] };
    const csv = instructorRecordsCsv(report);
    expect(csv).toContain('"Nepotvrzené minulé lekce (nezahrnuté v souhrnu)";"1"');
    expect(csv).toContain('"Instruktor";"Nepotvrzená lekce"');
    expect(csv).toContain("bez potvrzených hodin a odměn");
  });
});

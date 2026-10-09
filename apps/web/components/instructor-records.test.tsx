import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletionForm, InstructorReportView } from "./instructor-records";
import type { Completion, InstructorReport } from "../lib/instructor-records";

const data: Completion = { session: { id: "s", className: "Formuj břicho a hýždě", instructorId: "i", instructorName: "Nicola", startAt: "2026-10-08T15:00:00Z", endAt: "2026-10-08T16:00:00Z", status: "scheduled" }, record: null, rosterToken: "a".repeat(64), bookings: [{ id: "b1", status: "reserved", priceCents: 16000, participantKind: "self", participantName: null, ownerName: "Klientka" }, { id: "b2", status: "reserved", priceCents: 16000, participantKind: "companion", participantName: "Doprovod", ownerName: "Klientka" }, { id: "b3", status: "cancelled_on_time", priceCents: 16000, participantKind: "self", participantName: null, ownerName: "Zrušená" }, { id: "b4", status: "attended", priceCents: 16000, participantKind: "self", participantName: null, ownerName: "Již potvrzená" }] };
const render = (input: Completion = data) => renderToStaticMarkup(<CompletionForm data={input} instructors={[{ id: "i", displayName: "Nicola", active: true }]} absent={["b2"]} setAbsent={() => undefined} busy={false} onSubmit={() => undefined} onReload={() => undefined} />);
afterEach(() => vi.useRealTimers());
describe("one-step lesson confirmation", () => {
  it("offers only reserved people, keeps companions independent and explains no-show fees", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    const html = render();
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain("doprovod (Klientka)");
    expect(html).not.toContain("Zrušená"); expect(html).not.toContain("Již potvrzená");
    expect(html).toContain("Počet nově potvrzených účastí: 1");
    expect(html).toContain("uhrazené a prominuté poplatky se nepřepisují");
    expect(html).toContain("prázdné = k doplnění");
    expect(html).toContain("Potvrdit účast ostatních a uložit lekci");
  });
  it("blocks future and studio-cancelled lesson confirmations", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T15:59:59Z"));
    expect(render()).toContain("Potvrzení bude dostupné po skončení lekce");
    expect(render()).toContain("disabled");
    vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    expect(render({ ...data, session: { ...data.session, status: "cancelled" } })).toContain("Zrušenou lekci nelze potvrdit");
  });
  it("shows empty, pending and review states without treating planned lessons or rewards as paid", () => {
    const report: InstructorReport = { month: "2026-10", timeZone: "Europe/Prague", records: [], summary: [], unconfirmedSessions: [data.session] };
    const html = renderToStaticMarkup(<InstructorReportView report={report} onSelect={() => undefined} />);
    expect(html).toContain("není potvrzená žádná");
    expect(html).toContain("K doplnění: 1");
    expect(html).toContain("automaticky nepovažuje za odvedený");
    expect(html).toContain("Výkaz není úplný: 1 minulých lekcí");
  });
  it("keeps a stale form visible but prevents submitting it until explicit reload", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    const html = renderToStaticMarkup(<CompletionForm data={data} instructors={[{ id: "i", displayName: "Nicola", active: true }]} absent={["b2"]} setAbsent={() => undefined} busy={false} stale onSubmit={() => undefined} onReload={() => undefined} />);
    expect(html).toContain("Docházka byla mezitím upravena jednotlivě");
    expect(html).toContain("Načtení nahradí rozepsaný formulář");
    expect(html).toMatch(/disabled="" type="submit"/);
    expect(html).toContain("checked");
  });
});

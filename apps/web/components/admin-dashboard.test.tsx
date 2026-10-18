import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookingsPanel } from "./admin-dashboard";

const props = { onCancellationSaved: async () => undefined, bookingDates: { from: "", through: "" }, bookings: [], busy: false, loading: false, loadingMore: false, nextCursor: "opaque-next-page", onAttendance: async () => undefined, onBack: () => undefined, onDates: () => undefined, onLoadMore: () => undefined, onSelect: () => undefined, onShowAll: () => undefined, selectedSession: null, sessions: [], showAll: true };

describe("administrator reservation pages", () => {
  it("keeps full term occupancy separate from the page size", () => {
    const session = { id: "test-term", bookingCount: 60, capacity: 80, className: "TRX", classTypeId: "test-class", instructorId: "instructor", instructorName: "Test", startAt: "2026-10-25T08:00:00Z", endAt: "2026-10-25T09:00:00Z", arrivalLeadMinutes: 10, changeNotice: null, equipment: "", locationAddress: "Test", locationName: "Studio", priceCents: 16000, status: "scheduled", suitability: "" };
    const html = renderToStaticMarkup(<BookingsPanel {...props} selectedSession={session} showAll={false} />);
    expect(html).toContain("60 rezervací k docházce");
    expect(html).toContain("Načíst další rezervace");
    expect(html).not.toContain('name="from"');
  });
  it("labels a partial global list and provides filters and a recoverable load-more state", () => {
    const html = renderToStaticMarkup(<BookingsPanel {...props} loadingMore />);
    expect(html).toContain("0 načtených rezervací");
    expect(html).toContain('name="from"'); expect(html).toContain('name="through"');
    expect(html).toContain("Načítám další rezervace"); expect(html).toContain("disabled");
    expect(renderToStaticMarkup(<BookingsPanel {...props} nextCursor={null} />)).not.toContain("Načíst další rezervace");
  });
  it("offers cancellation only for a future reserved person, separately from attendance",()=>{
    const booking={id:"test-booking",priceCents:16000,participant:{kind:"self" as const,name:null},status:"reserved",session:{id:"test-session",className:"TRX",startAt:"2099-01-01T17:00:00Z"},user:{email:"test@example.test",firstName:"Test",lastName:"Klient",phone:null}};
    const render=(b:typeof booking)=>renderToStaticMarkup(<BookingsPanel {...props} bookings={[b]} nextCursor={null}/>);
    expect(render(booking)).toContain("Odhlásit klienta");
    expect(render({...booking,status:"cancelled_on_time"})).not.toContain("Odhlásit klienta");
    expect(render({...booking,session:{...booking.session,startAt:"2020-01-01T17:00:00Z"}})).not.toContain("Odhlásit klienta");
  });

});

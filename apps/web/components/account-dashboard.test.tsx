import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Profile } from "../lib/api-types";
import { ProfileView, ReservationsView } from "./account-dashboard";

const baseProfile: Profile = {
  email: "client@example.test", emailVerified: false, firstName: "Nika", lastName: "Nová",
  phone: "+420700000000", profileComplete: true, roles: ["client"], subject: "client-1", termsVersion: "2026-08-01"
};

describe("ProfileView", () => {
  it("keeps studio administration hidden from a client", () => {
    const html = renderToStaticMarkup(<ProfileView busy={false} profile={baseProfile} saveProfile={async () => undefined} />);
    expect(html).not.toContain("Správa studia");
    expect(html).not.toContain('href="/admin"');
  });

  it("offers a direct protected administration entry to an administrator", () => {
    const html = renderToStaticMarkup(<ProfileView busy={false} profile={{ ...baseProfile, roles: ["client", "admin"] }} saveProfile={async () => undefined} />);
    expect(html).toContain("Správa studia");
    expect(html).toContain('href="/admin"');
    expect(html).toContain("správa otevře rovnou");
  });
});


describe("reservation pages", () => {
  const props = { busy: false, history: [], historyDates: { from: "", through: "" }, loadingMore: false, nextCursor: "opaque-next-page", onDates: () => undefined, onLoadMore: () => undefined, openCancellation: async () => undefined, period: "history" as const, setPeriod: () => undefined, upcoming: [] };
  it("offers the next page even when the current date range is empty and names both date fields", () => {
    const html = renderToStaticMarkup(<ReservationsView {...props} />);
    expect(html).toContain("Načíst další rezervace");
    expect(html).toContain('name="from"'); expect(html).toContain('name="through"');
    expect(html).toContain("Historie rezervací je zatím prázdná.");
  });
  it("makes load-in-progress visible, disabled, and does not promise more after the last page", () => {
    const loading = renderToStaticMarkup(<ReservationsView {...props} loadingMore />);
    expect(loading).toContain("Načítáme další rezervace"); expect(loading).toContain("disabled");
    const complete = renderToStaticMarkup(<ReservationsView {...props} nextCursor={null} />);
    expect(complete).not.toContain("Načíst další rezervace");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Profile } from "../lib/api-types";
import { ProfileView } from "./account-dashboard";

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
    expect(html).toContain("jednorázový ověřovací kód");
  });
});

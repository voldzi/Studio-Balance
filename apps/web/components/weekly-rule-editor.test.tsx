import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeeklyRuleEditor } from "./weekly-rule-editor";

describe("weekly rule editor", () => {
  it("pre-fills the actual slot and explains how future sessions are handled", () => {
    const html = renderToStaticMarkup(<WeeklyRuleEditor
      busy={false}
      instructors={[{ id: "kaca", displayName: "Kača Adamovská", active: true }]}
      onApplied={async () => undefined}
      rule={{ id: "rule", className: "Barre", instructorId: "kaca", instructorName: "Kača Adamovská",
        weekday: 3, localStartTime: "08:00", capacity: 8, bookingLeadDays: 30 }}
    />);
    expect(html).toContain('value="08:00"');
    expect(html).toContain('value="8"');
    expect(html).toContain('value="30"');
    expect(html).toContain("Individuálně upravené termíny zůstanou jako výjimky");
    expect(html).toContain("Zkontrolovat dopad");
    expect(html).not.toContain("Změnit cenu už potvrzených rezervací");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonInstructors, SessionInstructor } from "./lesson-instructors";
import { TeamPresentation } from "./team-section";

describe("people in lesson details", () => {
  it("distinguishes Wednesday and Sunday Jumping without relying on a future session list", () => {
    const html = renderToStaticMarkup(<LessonInstructors instructors={[
      { id: "nicola", displayName: "Nicola Lojšková", bio: "", scheduleNote: "Středa", portrait: { src: "/images/studio-balance/team/nicola-lojskova.webp", alt: "Nicola Lojšková", width: 1024, height: 1536 } },
      { id: "monika", displayName: "Monika Kubincová", bio: "", scheduleNote: "Neděle", portrait: { src: "/images/studio-balance/team/monika-kubincova.webp", alt: "Monika Kubincová", width: 1024, height: 1536 } }
    ]} />);
    expect(html).toContain("Lekci vedou"); expect(html).toContain("Středa"); expect(html).toContain("Neděle");
    expect(html).toContain("nicola-lojskova.webp"); expect(html).toContain("monika-kubincova.webp");
  });

  it("keeps the assigned person's name when their photo is missing", () => {
    const html = renderToStaticMarkup(<SessionInstructor instructor={{ id: "substitute", displayName: "Zastupující instruktor", portrait: null }} />);
    expect(html).toContain("Zastupující instruktor"); expect(html).toContain("Fotografie není k dispozici"); expect(html).not.toContain("<img");
  });

  it("shows the uncropped team image with its supplied dimensions and a lesson link", () => {
    const html = renderToStaticMarkup(<TeamPresentation team={{ title: "Náš tým", body: "Lidé ze Studia Balance.", photo: { src: "/images/studio-balance/team/studio-balance-team.webp", alt: "Tým Studia Balance", width: 1024, height: 1535 } }} />);
    expect(html).toContain('width="1024"'); expect(html).toContain('height="1535"'); expect(html).toContain('href="/lekce"');
    expect(html).not.toContain('position:absolute');
  });
});

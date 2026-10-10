import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewForm } from "./admin-dashboard";
import { ReviewDecisionForm, ReviewSubmissionCard, ReviewSubmissions, type AdminReviewSubmission } from "./review-submissions";

const item: AdminReviewSubmission = { id: "test", authorLabel: "J. K.", body: "Moje zkušenost. <script>alert(1)</script>", rating: 1, status: "pending", createdAt: "2026-10-10T10:00:00Z", moderatedAt: null, moderationReason: null, reviewId: null, consentVersion: "review-v1", consentedAt: "2026-10-10T10:00:00Z" };
const formProps = { disabled: false, featured: false, reason: "", confirmed: false, onFeatured: () => undefined, onReason: () => undefined, onConfirmed: () => undefined, onCancel: () => undefined, onSubmit: () => undefined };

describe("client review moderation", () => {
  it("keeps original text and even low stars readable, without rendering submitted HTML", () => {
    const html = renderToStaticMarkup(<ReviewSubmissionCard item={item} />);
    expect(html).toContain("J. K.");
    expect(html).toContain("Hodnocení 1 z 5");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("textarea");
  });
  it("requires a second explicit approval and starts featured unchecked", () => {
    const html = renderToStaticMarkup(<ReviewDecisionForm {...formProps} selection={{ item, decision: "approve" }} />);
    expect(html).toContain("Kontrola před zveřejněním");
    expect(html).toContain("přesně uvedené jméno");
    expect(html).not.toContain('checked=""');
    expect(html).toMatch(/type="submit" disabled=""/);
    expect(html).not.toContain("textarea");
    expect(renderToStaticMarkup(<ReviewDecisionForm {...formProps} selection={{ item, decision: "approve" }} confirmed />)).not.toMatch(/type="submit" disabled=""/);
  });
  it("requires a meaningful internal rejection reason and never treats low stars as rejection", () => {
    const html = renderToStaticMarkup(<ReviewDecisionForm {...formProps} selection={{ item, decision: "reject" }} />);
    expect(html).toContain('minLength="3"');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain("nízké hodnocení není důvodem");
    expect(html).toContain("pouze v administraci");
    expect(html).toMatch(/type="submit" disabled=""/);
  });
  it("preserves a submitted review's original values in the legacy editor", () => {
    const review = { ...item, submittedByClient: true, classTypeId: null, consentConfirmed: true, published: true, featured: false, reviewedOn: null, sortOrder: 10, source: "Klientský formulář" };
    const html = renderToStaticMarkup(<ReviewForm busy={false} classTypes={[]} item={review} nextSortOrder={20} onCancel={() => undefined} onSubmit={async () => undefined} />);
    expect(html).not.toContain('name="authorLabel"');
    expect(html).not.toContain('name="body"');
    expect(html).not.toContain('name="rating"');
    expect(html).toContain('name="published"');
    expect(html).toContain('name="featured"');
    expect(html).toContain("Uložit zobrazení");
  });
  it("explains moderation and links the exact web form and printable studio QR", () => {
    const html = renderToStaticMarkup(<ReviewSubmissions busy={false} onAuthRequired={() => undefined} onModerated={async () => undefined} />);
    expect(html).toContain('href="/recenze/napsat"');
    expect(html).toContain('href="/recenze/qr"');
    expect(html).toContain("Návštěvu studia formulář neověřuje");
    expect(html).toContain("Čekající na kontrolu");
    expect(html).toContain("Načítáme recenze od klientů");
  });
});

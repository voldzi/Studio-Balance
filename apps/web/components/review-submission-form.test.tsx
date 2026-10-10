import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewSubmissionForm, reviewPublicationConsent } from "./review-submission-form";
import { ReviewInvitation, ReviewsShowcase } from "./reviews-showcase";
import { metadata } from "../app/recenze/napsat/page";

describe("public review form", () => {
  it("starts with no rating, an unchecked affirmative consent and no email or account fields", () => {
    const html = renderToStaticMarkup(<ReviewSubmissionForm />);
    expect(html).toMatch(/<option value="" selected="">Bez hvězdiček/);
    expect(html).not.toContain('checked=""');
    expect(html).toContain(reviewPublicationConsent);
    expect(html).toContain('name="authorLabel"');
    expect(html).toContain('name="body"');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('type="password"');
    expect(html).toMatch(/type="submit" disabled=""/);
  });
  it("labels text limits and privacy and keeps the spam trap out of keyboard navigation", () => {
    const html = renderToStaticMarkup(<ReviewSubmissionForm />);
    expect(html).toContain('for="review-author"');
    expect(html).toContain('for="review-body"');
    expect(html).toContain('minLength="10"');
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain('hidden="" aria-hidden="true"');
    const trap = html.match(/<input[^>]*name="website"[^>]*>/)?.[0];
    expect(trap).toContain('tabindex="-1"');
    expect(trap).toContain('autoComplete="off"');
    expect(html).toContain("Tento formulář neměříme");
    expect(html).not.toContain('href="/ochrana-osobnich-udaju"');
  });
  it("explains private moderation and never claims an anonymous visit was verified", () => {
    const html = renderToStaticMarkup(<ReviewSubmissionForm />);
    expect(html).toContain("nezveřejní automaticky");
    expect(html).toContain("neověřuje, zda jste studio navštívili");
    expect(html).toContain("odvolat souhlas");
    expect(html).not.toContain("ověřená recenze");
  });
  it("keeps the writing page out of search indexing", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
  });
});

describe("review invitations", () => {
  it("always exposes the direct form on the homepage even before reviews load", () => {
    const html = renderToStaticMarkup(<ReviewsShowcase homepage />);
    expect(html).toContain('href="/recenze/napsat"');
    expect(html).toContain("Napsat recenzi");
    expect(html).not.toContain("ověřené zkušenosti");
  });
  it("has the same direct form invitation outside the homepage", () => {
    expect(renderToStaticMarkup(<ReviewInvitation />)).toContain('href="/recenze/napsat"');
  });
});

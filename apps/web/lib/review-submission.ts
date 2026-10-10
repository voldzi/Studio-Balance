import { ApiError, apiRequest } from "./api-types";

export type ReviewChallenge = { token: string; consentVersion: string; expiresAt: string };
export type ReviewDraft = { authorLabel: string; body: string; rating: string; consent: boolean; website: string };
export type ReviewField = "authorLabel" | "body" | "rating" | "consent";
export type ReviewValidation = Partial<Record<ReviewField, string>>;
export const supportedReviewConsentVersion = "reviews-public-v1-2026-10-10";
export class ReviewConsentVersionError extends Error {}

export function validateReviewDraft(draft: ReviewDraft): ReviewValidation {
  const errors: ReviewValidation = {};
  if (draft.authorLabel.trim().length < 1 || draft.authorLabel.trim().length > 80) errors.authorLabel = "Napište jméno nebo iniciály v délce 1 až 80 znaků.";
  if (draft.body.trim().length < 10 || draft.body.trim().length > 2000) errors.body = "Napište svou zkušenost v délce 10 až 2 000 znaků.";
  if (draft.rating !== "" && !/^[1-5]$/.test(draft.rating)) errors.rating = "Vyberte hodnocení od 1 do 5, nebo jej nechte prázdné.";
  if (!draft.consent) errors.consent = "Pro odeslání potřebujeme váš souhlas se zveřejněním uvedeného jména a textu.";
  return errors;
}

export async function loadReviewChallenge(signal?: AbortSignal): Promise<ReviewChallenge> {
  const challenge = await apiRequest<ReviewChallenge>("/api/v1/review-submissions/challenge", { credentials: "omit", signal: signal ?? null });
  if (challenge.consentVersion !== supportedReviewConsentVersion) throw new ReviewConsentVersionError("Je potřeba načíst aktuální podobu formuláře.");
  return challenge;
}

export async function sendReviewDraft(draft: ReviewDraft, challenge: ReviewChallenge): Promise<void> {
  if (challenge.consentVersion !== supportedReviewConsentVersion) throw new ReviewConsentVersionError("Je potřeba načíst aktuální podobu formuláře.");
  const result = await apiRequest<{ status: "pending" }>("/api/v1/review-submissions", {
    method: "POST", credentials: "omit", body: JSON.stringify({
      authorLabel: draft.authorLabel.trim(), body: draft.body.trim(), rating: draft.rating ? Number(draft.rating) : null,
      consent: draft.consent, consentVersion: challenge.consentVersion, token: challenge.token, website: draft.website
    })
  });
  if (result.status !== "pending") throw new Error("Výsledek odeslání se nepodařilo ověřit. Zkuste to prosím později.");
}

export function reviewSubmissionError(error: unknown): { message: string; refreshChallenge: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 429) return { message: "Teď přišlo příliš mnoho požadavků. Chvíli prosím počkejte a zkuste odeslání znovu. Vaše údaje zůstávají vyplněné.", refreshChallenge: false };
    if (["REVIEW_CHALLENGE_EXPIRED", "REVIEW_CONSENT_VERSION_CHANGED", "REVIEW_SUBMISSION_CONFLICT"].includes(error.code)) return { message: "Ověření formuláře už není platné. Obnovíme ho; zkontrolujte svou recenzi a znovu stiskněte Odeslat recenzi. Vaše údaje zůstávají vyplněné.", refreshChallenge: true };
    if (error.code === "REVIEW_CHALLENGE_TOO_RECENT") return { message: "Chvíli prosím počkejte a znovu stiskněte Odeslat recenzi. Vaše recenze zůstává vyplněná.", refreshChallenge: false };
  }
  return { message: "Odeslání se nepodařilo ověřit. Vaše údaje zůstávají vyplněné; zkuste to prosím znovu. Pokud už první pokus dorazil, opakování stejné recenze ji nepřidá dvakrát.", refreshChallenge: false };
}

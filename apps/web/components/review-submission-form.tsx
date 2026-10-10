"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { loadReviewChallenge, ReviewConsentVersionError, reviewSubmissionError, sendReviewDraft, validateReviewDraft, type ReviewChallenge, type ReviewDraft, type ReviewValidation } from "../lib/review-submission";

export const reviewPublicationConsent = "Souhlasím se zveřejněním uvedeného jména nebo iniciál, textu recenze a případného hodnocení na webu Studia Balance. Recenze bude zveřejněna až po kontrole studiem.";
const blankDraft: ReviewDraft = { authorLabel: "", body: "", rating: "", consent: false, website: "" };

export function ReviewSubmissionForm() {
  const [draft, setDraft] = useState<ReviewDraft>(blankDraft);
  const [challenge, setChallenge] = useState<ReviewChallenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(true);
  const [needsPageRefresh, setNeedsPageRefresh] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<ReviewValidation>({});
  const [message, setMessage] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  const challengeGeneration = useRef(0);
  const mounted = useRef(true);

  const refreshChallenge = useCallback(async (signal?: AbortSignal) => {
    const generation = ++challengeGeneration.current;
    setLoadingChallenge(true);
    setChallenge(null);
    try {
      const next = await loadReviewChallenge(signal);
      if (!mounted.current || signal?.aborted || generation !== challengeGeneration.current) return false;
      setChallenge(next);
      setNeedsPageRefresh(false);
      return true;
    } catch (failure) {
      if (mounted.current && !signal?.aborted && generation === challengeGeneration.current) {
        if (failure instanceof ReviewConsentVersionError) {
          setNeedsPageRefresh(true); setDraft((current) => ({ ...current, consent: false }));
          setMessage("Tato podoba formuláře už není aktuální. Zkopírujte si prosím rozepsaný text a načtěte formulář znovu tlačítkem níže. Teď nic neodesíláme; vaše údaje zatím zůstávají na této stránce.");
        } else setMessage("Formulář se nepodařilo připravit k odeslání. Text můžete dál psát; potom zkuste obnovit ověření níže.");
      }
      return false;
    } finally {
      if (mounted.current && !signal?.aborted && generation === challengeGeneration.current) setLoadingChallenge(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void refreshChallenge(controller.signal);
    return () => { mounted.current = false; controller.abort(); };
  }, [refreshChallenge]);
  useEffect(() => {
    if (message || sent) outcomeRef.current?.focus();
  }, [message, sent]);

  function update<Key extends keyof ReviewDraft>(key: Key, value: ReviewDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key !== "website") setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || submitting || loadingChallenge || sent) return;
    const validation = validateReviewDraft(draft);
    setErrors(validation);
    const first = Object.keys(validation)[0];
    if (first) { formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    if (!challenge) { setMessage("Nejprve obnovte ověření formuláře. Vaše údaje zůstávají vyplněné."); return; }
    if (Date.parse(challenge.expiresAt) <= Date.now()) {
      setMessage("Platnost formuláře skončila. Obnovíme jeho ověření; poté znovu stiskněte Odeslat recenzi. Vaše údaje zůstávají vyplněné.");
      await refreshChallenge();
      return;
    }
    submitLock.current = true;
    setSubmitting(true); setMessage(undefined);
    try {
      await sendReviewDraft(draft, challenge);
      if (mounted.current) { setSent(true); setChallenge(null); }
    } catch (error) {
      if (!mounted.current) return;
      const outcome = reviewSubmissionError(error);
      setMessage(outcome.message);
      if (outcome.refreshChallenge) await refreshChallenge();
    } finally {
      submitLock.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  if (sent) return <div className="review-submission-outcome" ref={outcomeRef} tabIndex={-1} role="status">
    <p className="eyebrow">Děkujeme za vaši zkušenost</p><h2>Recenze dorazila do studia</h2>
    <p>Nejprve ji zkontrolujeme. Po schválení se objeví mezi recenzemi na webu. Teď už nemusíte nic dalšího dělat.</p>
    <Link className="button button-secondary" href="/recenze">Zpět na recenze</Link>
  </div>;

  return <section className="review-submission-card" aria-labelledby="review-form-title">
    <h2 id="review-form-title">Jak se vám u nás líbilo?</h2>
    <p className="review-form-intro">Stačí krátká, upřímná zkušenost. Přihlášení není potřeba. Uvedené jméno a text se po schválení zobrazí veřejně; neuvádějte telefon, e-mail ani citlivé údaje.</p>
    <form className="review-submission-form" noValidate ref={formRef} onSubmit={(event) => void submit(event)}>
      <label htmlFor="review-author">Jméno nebo iniciály<input id="review-author" name="authorLabel" autoComplete="nickname" maxLength={80} required disabled={submitting} value={draft.authorLabel} aria-invalid={Boolean(errors.authorLabel)} aria-describedby={errors.authorLabel ? "review-author-error" : "review-author-help"} onChange={(event) => update("authorLabel", event.target.value)} /></label>
      <p className="review-field-help" id="review-author-help">Například Jana nebo J. K. Příjmení uvádět nemusíte.</p>
      {errors.authorLabel && <p className="review-field-error" id="review-author-error" role="alert">{errors.authorLabel}</p>}
      <label htmlFor="review-body">Vaše zkušenost<textarea id="review-body" name="body" rows={6} minLength={10} maxLength={2000} required disabled={submitting} value={draft.body} aria-invalid={Boolean(errors.body)} aria-describedby={errors.body ? "review-body-error" : "review-body-help"} onChange={(event) => update("body", event.target.value)} /></label>
      <p className="review-field-help" id="review-body-help">10 až 2 000 znaků. Napište, co vám vyhovovalo a co bychom mohli zlepšit.</p>
      {errors.body && <p className="review-field-error" id="review-body-error" role="alert">{errors.body}</p>}
      <fieldset className="review-rating-field"><legend>Hodnocení (volitelné)</legend>
        <label className="sr-only" htmlFor="review-rating">Hodnocení od 1 do 5 hvězdiček</label>
        <select id="review-rating" name="rating" disabled={submitting} value={draft.rating} aria-invalid={Boolean(errors.rating)} aria-describedby={errors.rating ? "review-rating-error" : undefined} onChange={(event) => update("rating", event.target.value)}><option value="">Bez hvězdiček</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} z 5 hvězdiček</option>)}</select>
        {errors.rating && <p className="review-field-error" id="review-rating-error" role="alert">{errors.rating}</p>}
      </fieldset>
      <div hidden aria-hidden="true"><label htmlFor="review-website">Toto pole nevyplňujte<input id="review-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={draft.website} onChange={(event) => update("website", event.target.value)} /></label></div>
      <label className="review-consent" htmlFor="review-consent"><input id="review-consent" name="consent" type="checkbox" required disabled={submitting} checked={draft.consent} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "review-consent-error" : "review-privacy-help"} onChange={(event) => update("consent", event.target.checked)} /><span>{reviewPublicationConsent}</span></label>
      {errors.consent && <p className="review-field-error" id="review-consent-error" role="alert">{errors.consent}</p>}
      <p className="review-field-help" id="review-privacy-help">O odstranění recenze a odvolání souhlasu můžete později požádat přes <Link href="/kontakt">kontakt studia</Link>.</p>
      <details className="review-privacy"><summary>Jak pracujeme s vaší recenzí?</summary><p>Studio Balance uloží jméno nebo iniciály, text, případné hodnocení a váš souhlas, aby mohlo recenzi zkontrolovat a po schválení zveřejnit. Před schválením ji vidí pouze správa studia. Souhlas se vztahuje jen k tomuto zveřejnění.</p><p>Formulář nevyžaduje kontakt ani účet a neověřuje, zda jste studio navštívili. Pište proto jen svou vlastní zkušenost. Pro omezení spamu používáme dočasné bezpečnostní údaje. Tento formulář neměříme ve statistice návštěvnosti.</p><p>Pokud chcete recenzi odstranit nebo odvolat souhlas, napište či zavolejte studiu a uveďte znění recenze a použité jméno. Můžeme požádat o upřesnění, abychom neodstranili recenzi jiné osoby.</p></details>
      {message && <div className="review-submission-error" role="alert" ref={outcomeRef} tabIndex={-1}>{message}</div>}
      {loadingChallenge && <p className="review-field-help" role="status">Připravujeme bezpečné odeslání…</p>}
      {!challenge && !loadingChallenge && (needsPageRefresh
        ? <button className="button button-secondary" disabled={submitting} type="button" onClick={() => window.location.reload()}>Načíst aktuální formulář</button>
        : <button className="button button-secondary" disabled={submitting} type="button" onClick={() => { setMessage(undefined); void refreshChallenge(); }}>Obnovit ověření formuláře</button>)}
      <button className="button" type="submit" disabled={submitting || loadingChallenge || !challenge}>{submitting ? "Odesíláme recenzi…" : "Odeslat recenzi"}</button>
      <p className="review-field-help">Odesláním se recenze nezveřejní automaticky. Studio nejprve ověří, zda neobsahuje spam, osobní údaje jiných lidí nebo nevhodný obsah.</p>
    </form>
  </section>;
}

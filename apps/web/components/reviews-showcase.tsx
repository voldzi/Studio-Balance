"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../lib/api-types";

export type PublicReview = {
  authorLabel: string;
  body: string;
  classType: { id: string; name: string; slug: string } | null;
  id: string;
  rating: number | null;
  reviewedOn: string | null;
  source: string | null;
};

export function ReviewInvitation({ homepage = false }: { homepage?: boolean }) {
  return <div className="review-invitation"><div><p className="eyebrow">Vaše zkušenost nám pomáhá</p><h2>{homepage ? "Jak se vám u nás líbilo?" : "Podělte se o svou zkušenost"}</h2><p>Napište krátkou recenzi. Přihlášení není potřeba; nejprve ji zkontroluje studio.</p></div><Link className="button button-secondary" href="/recenze/napsat">Napsat recenzi</Link></div>;
}

export function ReviewsShowcase({ homepage = false }: { homepage?: boolean }) {
  const [items, setItems] = useState<PublicReview[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const query = homepage ? "?featured=true" : "";
      setItems((await apiRequest<{ items: PublicReview[] }>(`/api/v1/reviews${query}`)).items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [homepage]);

  useEffect(() => { void load(); }, [load]);

  if (state === "loading") {
    return homepage ? <section aria-label="Recenze klientek" className="reviews-section reviews-loading"><p role="status">Načítáme zkušenosti klientek…</p><ReviewInvitation homepage /></section> : <><p className="content-message" role="status">Načítáme recenze…</p><ReviewInvitation /></>;
  }
  if (state === "error") {
    return <><div className="content-message" role="alert"><p>Recenze se právě nepodařilo načíst.</p><button className="button button-secondary" onClick={() => void load()} type="button">Zkusit znovu</button></div><ReviewInvitation homepage={homepage} /></>;
  }
  if (!items.length) {
    return homepage ? <section className="reviews-section" aria-label="Recenze klientek"><ReviewInvitation homepage /></section> : <><div className="content-message"><p>Zatím není zveřejněná žádná zkušenost. Vaši recenzi nejprve zkontroluje studio.</p></div><ReviewInvitation /></>;
  }

  const cards = <div className="reviews-grid">{items.map((review) => <ReviewCard key={review.id} review={review} />)}</div>;
  if (!homepage) return <>
    {cards}
    <ReviewInvitation />
    <div className="reviews-action"><Link className="button" href="/rozvrh">Vybrat si lekci</Link></div>
  </>;

  return <section aria-labelledby="reviews-title" className="reviews-section reviews-section-homepage">
    <div className="section-heading">
      <div><p className="eyebrow">Zkušenosti klientek</p><h2 id="reviews-title">Pohyb, ke kterému se rády vracejí</h2></div>
      <Link className="text-link" href="/recenze">Všechny recenze</Link>
    </div>
    {cards}
    <ReviewInvitation homepage />
    <div className="reviews-action"><Link className="button" href="/rozvrh">Vybrat si lekci</Link></div>
  </section>;
}

function ReviewCard({ review }: { review: PublicReview }) {
  const reviewedOn = review.reviewedOn
    ? new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Prague" }).format(new Date(`${review.reviewedOn}T12:00:00Z`))
    : null;
  return <blockquote className="review-card">
    {review.rating && <p className="review-rating"><span aria-hidden="true">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span><span className="sr-only">Hodnocení {review.rating} z 5</span></p>}
    <p className="review-quote">„{review.body}“</p>
    <div className="review-attribution">
      <cite>{review.authorLabel}</cite>
      {review.classType && <Link href={`/lekce/${review.classType.slug}`}>{review.classType.name}</Link>}
      {(review.source || reviewedOn) && <span className="review-meta">{[review.source, reviewedOn].filter(Boolean).join(" · ")}</span>}
    </div>
  </blockquote>;
}

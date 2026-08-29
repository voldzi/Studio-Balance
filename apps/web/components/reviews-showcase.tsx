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
    return homepage ? <section aria-label="Recenze klientek" className="reviews-section reviews-loading"><p role="status">Načítáme zkušenosti klientek…</p></section> : <p className="content-message" role="status">Načítáme recenze…</p>;
  }
  if (state === "error") {
    return <div className="content-message" role="alert"><p>Recenze se právě nepodařilo načíst.</p><button className="button button-secondary" onClick={() => void load()} type="button">Zkusit znovu</button></div>;
  }
  if (!items.length) {
    return homepage ? null : <div className="content-message"><p>První ověřené zkušenosti zveřejníme po souhlasu klientek.</p><Link className="button button-secondary" href="/rozvrh">Prohlédnout rozvrh</Link></div>;
  }

  const cards = <div className="reviews-grid">{items.map((review) => <ReviewCard key={review.id} review={review} />)}</div>;
  if (!homepage) return <>
    {cards}
    <div className="reviews-action"><Link className="button" href="/rozvrh">Vybrat si lekci</Link></div>
  </>;

  return <section aria-labelledby="reviews-title" className="reviews-section reviews-section-homepage">
    <div className="section-heading">
      <div><p className="eyebrow">Zkušenosti klientek</p><h2 id="reviews-title">Pohyb, ke kterému se rády vracejí</h2></div>
      <Link className="text-link" href="/recenze">Všechny recenze</Link>
    </div>
    {cards}
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

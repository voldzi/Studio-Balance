"use client";

import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useState } from "react";

import { publicSessionLabel } from "@studiobalance/domain";

import { apiRequest, formatStudioDate, type ClassTypeDetail } from "../lib/api-types";
import { DifficultyStars } from "./difficulty-stars";

export function LessonDetail({ slug }: { slug: string }) {
  const [lesson, setLesson] = useState<ClassTypeDetail>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try { setLesson(await apiRequest<ClassTypeDetail>(`/api/v1/class-types/${slug}`)); setState("ready"); }
    catch { setState("error"); }
  }, [slug]);
  useEffect(() => { void load(); }, [load]);
  if (state === "loading") return <p className="content-message" role="status">Načítáme detail lekce…</p>;
  if (state === "error" || !lesson) return <div className="content-message" role="alert"><p>Detail lekce se nepodařilo načíst.</p><Link className="button button-secondary" href="/lekce">Zpět na lekce</Link></div>;

  return <article className="lesson-detail">
    <div className="lesson-detail-hero" style={lesson.heroImage ? { "--lesson-detail-backdrop": `url(${lesson.heroImage.src})` } as CSSProperties : undefined}>
      {lesson.heroImage ? <Image alt={lesson.heroImage.alt} className="lesson-detail-image" fill priority sizes="(max-width: 760px) 100vw, 55vw" src={lesson.heroImage.src} /> : <div className="lesson-image-fallback" aria-hidden="true" />}
    </div>
    <div className="lesson-detail-copy">
      <p className="eyebrow">Studio Balance</p>
      <h1>{lesson.name}</h1>
      <p className="detail-lead">{lesson.tagline}</p>
      <p className="lesson-detail-stars"><DifficultyStars value={lesson.difficulty} /></p>
      <p>{lesson.description}</p>
      <dl className="detail-facts">
        <div><dt>Pro koho</dt><dd>{lesson.audience}</dd></div>
        <div><dt>Začátečníci</dt><dd>{lesson.suitableForBeginners ? "Ano, tempo lze upravit." : "Doporučujeme předchozí zkušenost nebo konzultaci s lektorkou."}</dd></div>
        <div><dt>Obvyklá délka</dt><dd>{lesson.durationMinutes} minut</dd></div>
        <div><dt>Pomůcky</dt><dd>{lesson.defaultEquipment}</dd></div>
      </dl>
      <section className="lesson-copy-section"><h2>Co lekce přináší</h2><p>{lesson.benefits}</p></section>
      <section className="lesson-copy-section"><h2>Co si vzít s sebou</h2><p>{lesson.whatToBring}</p></section>
      {lesson.practicalNotice && <aside className="lesson-notice"><h2>Praktická informace</h2><p>{lesson.practicalNotice}</p></aside>}
    </div>
    <section className="lesson-sessions" aria-labelledby="lesson-sessions-title">
      <div><p className="eyebrow">Rozvrh</p><h2 id="lesson-sessions-title">Nejbližší termíny</h2></div>
      {lesson.upcomingSessions.length ? <div className="lesson-session-list">{lesson.upcomingSessions.map((session) => <Link className="lesson-session" href={`/rozvrh/${session.id}`} key={session.id}><time dateTime={session.startAt}>{formatStudioDate(session.startAt, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</time><span>{session.instructor.displayName}</span><strong>{publicSessionLabel(session.availability)}</strong></Link>)}</div> : <p className="content-message">Pro tuto lekci zatím není vypsaný žádný další termín. Podívejte se na celý rozvrh.</p>}
      <Link className="button" href="/rozvrh">Zobrazit rozvrh</Link>
    </section>
  </article>;
}

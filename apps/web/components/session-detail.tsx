"use client";

import { SessionInstructor } from "./lesson-instructors";
import Link from "next/link";
import { useEffect, useState } from "react";

import { publicSessionLabel } from "@studiobalance/domain";

import { apiRequest, formatPrice, formatStudioDate, type PublicSession } from "../lib/api-types";

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<PublicSession>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSession(undefined); setFailed(false);
    void apiRequest<PublicSession>(`/api/v1/sessions/${sessionId}`, { signal: controller.signal })
      .then(setSession).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [sessionId]);

  if (failed) return <p className="schedule-message" role="alert">Detail lekce se nepodařilo načíst.</p>;
  if (!session) return <p className="schedule-message" role="status">Načítáme detail lekce…</p>;

  const bookable = session.availability === "bookable";
  return (
    <article className="session-detail">
      <SessionInstructor instructor={session.instructor} />
      <div className="session-detail-copy">
        <p className="eyebrow">{formatStudioDate(session.startAt, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1>{session.classType.name}</h1>
        <p className="detail-lead">{session.classType.tagline}</p>
        <Link className="text-link" href={`/lekce/${session.classType.slug}`}>Detail typu lekce</Link>
        <dl className="detail-facts">
          <div><dt>Čas</dt><dd>{formatStudioDate(session.startAt, { hour: "2-digit", minute: "2-digit" })}–{formatStudioDate(session.endAt, { hour: "2-digit", minute: "2-digit" })}</dd></div>
          <div><dt>Příchod</dt><dd>Prosíme v {formatStudioDate(session.arrivalAt, { hour: "2-digit", minute: "2-digit" })}</dd></div>
          <div><dt>Lekci vede</dt><dd>{session.instructor.displayName}</dd></div>
          <div><dt>Cena</dt><dd>{formatPrice(session.price)} · platba ve studiu</dd></div>
          <div><dt>Místo</dt><dd>{session.location.name}, {session.location.address}</dd></div>
          <div><dt>Stav</dt><dd>{publicSessionLabel(session.availability)}</dd></div>
        </dl>
        {session.changeNotice && <aside className="lesson-notice"><h2>Změna termínu</h2><p>{session.changeNotice}</p><p>Přihlášení klienti najdou podrobnosti včetně bezplatného storna ve zprávách svého účtu.</p></aside>}
        <div className="detail-notes">
          <div><h2>Co si vzít</h2><p>{session.whatToBring}</p></div>
          <div><h2>Pomůcky ve studiu</h2><p>{session.equipment || "Všechny pomůcky potřebné pro lekci jsou připravené ve studiu."}</p></div>
          <div><h2>Pro koho</h2><p>{session.suitability}</p></div>
        </div>
        <p className="cancellation-copy">Bezplatné storno je možné nejpozději 24 hodin před začátkem. Později vzniká poplatek ve výši ceny lekce, hrazený pouze ve studiu.</p>
        {bookable ? (
          <Link className="button detail-button" href={`/rezervace/${session.id}`}>Rezervovat lekci</Link>
        ) : (
          <span className="button button-disabled" aria-disabled="true">{publicSessionLabel(session.availability)}</span>
        )}
      </div>
    </article>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { publicSessionLabel } from "@studiobalance/domain";

import { apiRequest, formatPrice, formatStudioDate, type PublicSession } from "../lib/api-types";

export function ScheduleView() {
  const [sessions, setSessions] = useState<PublicSession[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await apiRequest<{ items: PublicSession[] }>("/api/v1/sessions");
      setSessions(response.items);
      setSelectedDay((current) => current ?? response.items[0]?.startAt.slice(0, 10));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => Array.from(new Set(sessions.map((session) => session.startAt.slice(0, 10)))), [sessions]);
  const visible = sessions.filter((session) => session.startAt.slice(0, 10) === selectedDay);

  if (state === "loading") return <p className="schedule-message" role="status">Načítáme aktuální rozvrh…</p>;
  if (state === "error") {
    return (
      <div className="schedule-message" role="alert">
        <p>Rozvrh se právě nepodařilo načíst.</p>
        <button className="button button-secondary" onClick={() => void load()} type="button">Zkusit znovu</button>
      </div>
    );
  }
  if (!sessions.length) return <p className="schedule-message">Pro vybrané období zatím nejsou vypsané žádné lekce.</p>;

  return (
    <div className="schedule-panel">
      <div className="day-tabs" role="tablist" aria-label="Vyberte den">
        {days.map((day) => {
          const date = new Date(`${day}T12:00:00+02:00`);
          return (
            <button
              aria-selected={selectedDay === day}
              className={selectedDay === day ? "day-tab day-tab-active" : "day-tab"}
              key={day}
              onClick={() => setSelectedDay(day)}
              role="tab"
              type="button"
            >
              <span>{new Intl.DateTimeFormat("cs-CZ", { weekday: "short" }).format(date)}</span>
              <strong>{new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(date)}</strong>
            </button>
          );
        })}
      </div>
      <div className="session-list" role="tabpanel">
        {visible.map((session) => (
          <article className="session-row" key={session.id}>
            <time dateTime={session.startAt}>
              {formatStudioDate(session.startAt, { hour: "2-digit", minute: "2-digit" })}
              <span>– {formatStudioDate(session.endAt, { hour: "2-digit", minute: "2-digit" })}</span>
            </time>
            <div className="session-main">
              <h2>{session.classType.name}</h2>
              <p>{session.classType.tagline} · {session.instructor.displayName}</p>
            </div>
            <div className="session-meta">
              <span className={`availability availability-${session.availability}`}>{publicSessionLabel(session.availability)}</span>
              <span>{formatPrice(session.price)}</span>
            </div>
            <Link className="session-link" href={`/rozvrh/${session.id}`} aria-label={`Detail lekce ${session.classType.name}`}>Detail</Link>
          </article>
        ))}
      </div>
      <p className="schedule-note">Kapacitu ani počet zbývajících míst nezobrazujeme. Stav ověřujeme znovu při rezervaci.</p>
    </div>
  );
}

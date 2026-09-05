"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, type TeamContent } from "../lib/api-types";
import { StudioPhoto } from "./studio-photo";

export function TeamPresentation({ team }: { team: TeamContent }) {
  return <section className="studio-team-section" aria-labelledby="studio-team-title">
    <StudioPhoto image={team.photo} />
    <div><p className="eyebrow">Studio Balance</p><h2 id="studio-team-title">{team.title}</h2><p>{team.body}</p><Link className="button" href="/lekce">Vybrat lekci</Link></div>
  </section>;
}

export function TeamSection() {
  const [team, setTeam] = useState<TeamContent | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try { const result = await apiRequest<{ team: TeamContent | null }>("/api/v1/content/team"); setTeam(result.team); setState("ready"); }
    catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (state === "loading") return <p className="team-message" role="status">Načítáme představení týmu…</p>;
  if (state === "error") return <div className="team-message" role="alert"><p>Představení týmu se nepodařilo načíst.</p><button className="button button-secondary" onClick={() => void load()} type="button">Zkusit znovu</button></div>;
  return team ? <TeamPresentation team={team} /> : null;
}

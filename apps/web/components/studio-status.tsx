"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/api-types";

type Status = { open: boolean; announcement: string | null };
const closed: Status = { open: false, announcement: "Momentálně zavřeno. Studio zatím není v provozu. Registrace a rezervace spustíme, až oznámíme otevření." };
const Context = createContext<Status>(closed);
export const useStudioStatus = () => useContext(Context);
export function StudioStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(closed);
  useEffect(() => {
    let active = true;
    const refresh = () => { void apiRequest<Status>("/api/v1/studio-status", { cache: "no-store" }).then((value) => { if (active) setStatus(value); }).catch(() => { if (active) setStatus(closed); }); };
    refresh();
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return <Context.Provider value={status}>{children}</Context.Provider>;
}
export function StudioAnnouncement() {
  const { open } = useStudioStatus();
  return open ? null : <aside className="studio-announcement" aria-label="Provoz studia"><strong>Momentálně zavřeno</strong><span>Studio zatím není v provozu. Registrace a rezervace spustíme, až oznámíme otevření.</span></aside>;
}
export function RegistrationNotice() {
  const { open } = useStudioStatus();
  return <p className="auth-help">{open ? "Nový účet vytvoříte v následujícím bezpečném kroku." : "Nové registrace zatím nejsou spuštěné. Pokud už účet máte, můžete se přihlásit."}</p>;
}

export function ScheduleCallToAction() { const { open } = useStudioStatus(); return <Link className="button" href="/rozvrh">{open ? "Rezervovat lekci" : "Prohlédnout rozvrh"}</Link>; }

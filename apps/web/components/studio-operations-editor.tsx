"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "../lib/api-types";
type State = { open: boolean; requestedOpen: boolean; registrationSynced: boolean; announcement: string | null };
export function StudioOperationsEditor() {
  const [state, setState] = useState<State>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const announcementEdited = useRef(false);
  async function load() { try { const next = await apiRequest<State>("/api/v1/admin/studio-status", { cache: "no-store" }); setState(next); if (!announcementEdited.current) setAnnouncement(next.announcement ?? ""); setSessionExpired(false); } catch (error) { if (error instanceof ApiError && error.status === 401) setSessionExpired(true); else setMessage("Stav provozu se nepodařilo načíst. Zkuste jej obnovit."); } }
  useEffect(() => { void load(); const timer = setInterval(() => { void load(); }, 30_000); return () => clearInterval(timer); }, []);
  async function change(open: boolean) {
    setBusy(true); setMessage("");
    try { const next = await apiRequest<State>("/api/v1/admin/studio-status", { method: "PUT", body: JSON.stringify({ open }) }); setState(next); setMessage(next.open ? "Registrace a rezervace jsou spuštěné." : "Studio je označené jako zavřené. Registrace a rezervace jsou pozastavené."); }
    catch (error) { if (error instanceof ApiError && error.status === 401) setSessionExpired(true); else setMessage(error instanceof Error ? error.message : "Změnu se nepodařilo uložit."); await load(); }
    finally { setBusy(false); }
  }
  async function saveAnnouncement() {
    setBusy(true); setMessage("");
    try { const next = await apiRequest<State>("/api/v1/admin/studio-status/announcement", { method: "PUT", body: JSON.stringify({ announcement: announcement.trim() || null }) }); setState(next); setAnnouncement(next.announcement ?? ""); announcementEdited.current = false; setMessage(next.announcement ? "Provozní informace se zobrazí na webu i v rozvrhu." : "Provozní informace byla odstraněna."); }
    catch (error) { if (error instanceof ApiError && error.status === 401) setSessionExpired(true); else setMessage(error instanceof Error ? error.message : "Oznámení se nepodařilo uložit."); }
    finally { setBusy(false); }
  }
  return <section className="admin-data-card studio-operations" aria-labelledby="studio-operations-title">
    <h2 id="studio-operations-title">Otevření studia</h2>
    {!state ? <p role="status">Načítáme stav provozu…</p> : <>
      <p><strong>{state.open ? "Registrace a rezervace jsou spuštěné" : "Rezervace jsou pozastavené"}</strong></p>
      <p>{state.open ? "Klienti si mohou vytvářet účty a rezervovat lekce." : "Na webu je oznámení Momentálně zavřeno. Rozvrh zůstává dostupný k prohlížení."}</p>
      {!state.registrationSynced && <p role="status">Čekáme na potvrzení {state.requestedOpen ? "spuštění" : "pozastavení"} registrací. Změnu automaticky opakujeme; registrace mohou zatím odpovídat předchozímu stavu.</p>}
      <button className="button" disabled={busy} onClick={() => void change(!state.requestedOpen)} type="button">{busy ? "Ukládáme…" : state.requestedOpen ? "Pozastavit registrace a rezervace" : "Spustit registrace a rezervace"}</button>
      <p className="admin-form-note">Stávající účty a rezervace zůstanou zachované. Před spuštěním zkontrolujte aktuálnost rozvrhu.</p>
      <label><span className="admin-label-row">Informace v rozvrhu</span><textarea disabled={busy} maxLength={600} onChange={(event) => { announcementEdited.current = true; setAnnouncement(event.target.value); }} rows={3} value={announcement} /></label>
      <div className="admin-row-actions"><button className="button button-small" disabled={busy} onClick={() => void saveAnnouncement()} type="button">Uložit informaci</button><button disabled={busy || !announcement} onClick={() => { announcementEdited.current = true; setAnnouncement(""); }} type="button">Vymazat text</button></div>
    </>}
    <button className="text-link" disabled={busy} onClick={() => void load()} type="button">Obnovit stav</button>
    {sessionExpired && <p role="alert">Přihlášení vypršelo. <a href="/admin/prihlaseni" rel="noopener noreferrer" target="_blank">Přihlaste se v nové kartě</a>, pak se sem vraťte a změnu zopakujte.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}

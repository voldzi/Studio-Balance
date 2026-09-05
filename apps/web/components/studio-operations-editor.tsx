"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api-types";
type State = { open: boolean; requestedOpen: boolean; registrationSynced: boolean };
export function StudioOperationsEditor() {
  const [state, setState] = useState<State>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() { try { setState(await apiRequest<State>("/api/v1/admin/studio-status", { cache: "no-store" })); } catch { setMessage("Stav provozu se nepodařilo načíst. Zkuste jej obnovit."); } }
  useEffect(() => { void load(); const timer = setInterval(() => { void load(); }, 30_000); return () => clearInterval(timer); }, []);
  async function change(open: boolean) {
    setBusy(true); setMessage("");
    try { const next = await apiRequest<State>("/api/v1/admin/studio-status", { method: "PUT", body: JSON.stringify({ open }) }); setState(next); setMessage(next.open ? "Registrace a rezervace jsou spuštěné." : "Studio je označené jako zavřené. Registrace a rezervace jsou pozastavené."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Změnu se nepodařilo uložit."); await load(); }
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
    </>}
    <button className="text-link" disabled={busy} onClick={() => void load()} type="button">Obnovit stav</button>
    {message && <p role="status">{message}</p>}
  </section>;
}

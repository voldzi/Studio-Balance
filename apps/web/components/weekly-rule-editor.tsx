"use client";

import { FormEvent, useState } from "react";
import { ApiError, apiRequest } from "../lib/api-types";

export type EditableWeeklyRule = {
  id: string; className: string; instructorId: string; instructorName: string;
  weekday: number; localStartTime: string; capacity: number; bookingLeadDays: number;
};
type InstructorOption = { id: string; displayName: string; active: boolean };
type Input = { weekday: number; localStartTime: string; instructorId: string; capacity: number; bookingLeadDays: number; reason: string };
type Preview = { className: string; futureSessions: number; bookedSessions: number; activeBookings: number; manualSessions: number; exceptionSessions: number; previewToken: string };
const weekdays = ["", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

export function WeeklyRuleEditor({ rule, instructors, busy, onApplied }: {
  rule: EditableWeeklyRule; instructors: InstructorOption[]; busy: boolean; onApplied: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<{ input: Input; result: Preview } | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [expired, setExpired] = useState(false);

  async function showPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: Input = {
      weekday: Number(form.get("weekday")),
      localStartTime: String(form.get("localStartTime")),
      instructorId: String(form.get("instructorId")),
      capacity: Number(form.get("capacity")),
      bookingLeadDays: Number(form.get("bookingLeadDays")),
      reason: String(form.get("reason") ?? "").trim()
    };
    setPreview(null); setWorking(true); setMessage("");
    try {
      const result = await apiRequest<Preview>(`/api/v1/admin/weekly-rules/${rule.id}/preview`, { method: "POST", body: JSON.stringify(input) });
      setPreview({ input, result }); setExpired(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setExpired(true);
      setMessage(error instanceof Error ? error.message : "Dopad změny se nepodařilo načíst.");
    } finally { setWorking(false); }
  }

  async function apply() {
    if (!preview) return;
    const { input, result } = preview;
    if (!window.confirm(`Změnit ${rule.className} na ${weekdays[input.weekday]} v ${input.localStartTime}? Upraví se ${result.futureSessions} již vypsaných termínů a ${result.activeBookings} rezervací. Klientky při změně času nebo instruktora dostanou oznámení.`)) return;
    setWorking(true); setMessage("");
    try {
      await apiRequest(`/api/v1/admin/weekly-rules/${rule.id}/apply`, {
        method: "POST", body: JSON.stringify({ ...input, previewToken: result.previewToken })
      });
      setPreview(null); setExpired(false);
      setMessage("Pravidelná lekce a odpovídající budoucí termíny byly upraveny.");
      await onApplied();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setExpired(true);
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "Změnu se nepodařilo uložit. Zkontrolujte dopad znovu.");
    } finally { setWorking(false); }
  }

  return <details className="admin-create">
    <summary>Upravit pravidelnou lekci</summary>
    <form className="admin-form admin-form-grid" onChange={() => setPreview(null)} onSubmit={(event) => void showPreview(event)}>
      <p className="admin-form-note admin-form-wide">Změna upraví pravidlo i odpovídající budoucí termíny ve stejný den a čas. Individuálně upravené termíny zůstanou jako výjimky. Cenu celé lekce měňte samostatnou akcí níže.</p>
      <label>Den v týdnu<select defaultValue={rule.weekday} name="weekday" required>{weekdays.slice(1).map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
      <label>Začátek<input defaultValue={rule.localStartTime} name="localStartTime" required type="time" /></label>
      <label>Instruktor<select defaultValue={rule.instructorId} name="instructorId" required>{instructors.filter((item) => item.active || item.id === rule.instructorId).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <label>Kapacita<input defaultValue={rule.capacity} max={500} min={1} name="capacity" required type="number" /></label>
      <label>Otevřít rezervace před lekcí (dní)<input defaultValue={rule.bookingLeadDays} max={93} min={1} name="bookingLeadDays" required type="number" /></label>
      <label className="admin-form-wide">Důvod změny<textarea maxLength={1000} minLength={3} name="reason" required rows={2} placeholder="Např. Změna pravidelného rozvrhu od října." /></label>
      <div className="admin-row-actions"><button className="button" disabled={busy || working} type="submit">Zkontrolovat dopad</button></div>
    </form>
    {preview && <div className="admin-data-card" role="status">
      <h3>Co se změní</h3>
      <p>{preview.result.futureSessions} budoucích termínů · {preview.result.bookedSessions} termínů s rezervacemi · {preview.result.activeBookings} aktivních rezervací.</p>
      {preview.result.manualSessions > 0 && <p>{preview.result.manualSessions} dříve ručně vypsaných termínů odpovídá této pravidelné lekci a změní se také.</p>}
      {preview.result.exceptionSessions > 0 && <p role="alert">{preview.result.exceptionSessions} termínů bylo dříve individuálně přesunuto a touto akcí se nezmění. Zkontrolujte je v seznamu termínů.</p>}
      <p className="admin-form-note">Rezervace zůstanou zachované. Kapacita nesmí být nižší než počet přihlášených na kterémkoli termínu. Pokud se rozvrh mezitím změnil, bude nutné náhled zopakovat.</p>
      <button className="button" disabled={busy || working} onClick={() => void apply()} type="button">Potvrdit změnu</button>
    </div>}
    {expired && <p role="alert">Přihlášení vypršelo. <a href="/admin/prihlaseni" rel="noopener noreferrer" target="_blank">Přihlaste se v nové kartě</a> a dopad změny zkontrolujte znovu.</p>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </details>;
}

"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, formatStudioDate } from "../lib/api-types";

export type CancellationSession = {
  id: string;
  classTypeId: string;
  className: string;
  instructorId: string;
  instructorName: string;
  startAt: string;
  endAt: string;
  status: string;
  bookingCount: number;
};

export function studioSessionDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(value));
}

export function cancellableSessionsOnDate(sessions: CancellationSession[], date: string, now = Date.now()) {
  return sessions.filter((item) => item.status === "scheduled" && Date.parse(item.startAt) > now && studioSessionDate(item.startAt) === date)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

export function sameCancellationPreview(a: CancellationSession, b: CancellationSession): boolean {
  return a.id === b.id && a.classTypeId === b.classTypeId && a.className === b.className &&
    a.instructorId === b.instructorId && a.instructorName === b.instructorName &&
    Date.parse(a.startAt) === Date.parse(b.startAt) && Date.parse(a.endAt) === Date.parse(b.endAt) &&
    a.status === b.status && a.bookingCount === b.bookingCount;
}

function lessonDate(item: CancellationSession): string {
  return formatStudioDate(item.startAt, { weekday: "long", day: "numeric", month: "numeric", year: "numeric" });
}

function lessonTime(item: CancellationSession): string {
  return `${formatStudioDate(item.startAt, { hour: "2-digit", minute: "2-digit" })}–${formatStudioDate(item.endAt, { hour: "2-digit", minute: "2-digit" })}`;
}

export function SingleSessionCancellation({ sessions, initialSession, busy, onAuthRequired, onCancelled, onWorkingChange }: {
  sessions: CancellationSession[];
  initialSession?: CancellationSession | undefined;
  busy: boolean;
  onAuthRequired: () => void;
  onCancelled: () => Promise<void>;
  onWorkingChange?: (working: boolean) => void;
}) {
  const [date, setDate] = useState(() => studioSessionDate(initialSession?.startAt ?? new Date().toISOString()));
  const [selected, setSelected] = useState<CancellationSession | null>(initialSession ?? null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<"idle" | "checking" | "cancelling">("idle");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const submitLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const disabled = busy || phase !== "idle";
  const items = cancellableSessionsOnDate(sessions, date);
  const selectedUnavailable = selected && (selected.status !== "scheduled" || Date.parse(selected.startAt) <= Date.now());

  function resetSelection() {
    setSelected(null); setReason(""); setConfirmed(false); setError(undefined);
    requestAnimationFrame(() => dateInput.current?.focus());
  }

  function selectSession(item: CancellationSession) {
    setSelected(item); setReason(""); setConfirmed(false); setError(undefined); setSuccess(undefined);
    requestAnimationFrame(() => confirmationHeading.current?.focus());
  }

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || disabled || submitLock.current) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 1000) { setError("Napište důvod zrušení v délce 3 až 1 000 znaků."); return; }
    if (!confirmed) { setError("Nejprve potvrďte, že chcete zrušit pouze vybraný termín."); return; }
    submitLock.current = true; onWorkingChange?.(true); setError(undefined); setSuccess(undefined); setPhase("checking");
    try {
      const result = await apiRequest<{ items: CancellationSession[] }>("/api/v1/admin/sessions");
      if (!mounted.current) return;
      const current = result.items.find((item) => item.id === selected.id);
      if (!current || current.status !== "scheduled" || Date.parse(current.startAt) <= Date.now()) {
        setConfirmed(false);
        setError("Tento termín už nelze zrušit: není naplánovaný, už začal nebo není v aktuálním rozvrhu. Žádnou změnu jsme neprovedli.");
        return;
      }
      if (!sameCancellationPreview(selected, current)) {
        setSelected(current); setDate(studioSessionDate(current.startAt)); setConfirmed(false);
        setError("Termín nebo počet rezervací se mezitím změnil. Zkontrolujte aktuální údaje níže a zrušení potvrďte znovu. Žádnou změnu jsme neprovedli.");
        return;
      }
      setPhase("cancelling");
      await apiRequest(`/api/v1/admin/sessions/${encodeURIComponent(current.id)}/cancel`, {
        method: "POST", body: JSON.stringify({ reason: trimmed })
      });
      setSuccess(`${current.className} – ${lessonDate(current)}, ${lessonTime(current)}: termín byl zrušen. Ostatní termíny zůstávají zachované.`);
      setSelected(null); setReason(""); setConfirmed(false);
      try { await onCancelled(); }
      catch { setError("Zrušení bylo uložené, ale přehled se nepodařilo obnovit. Před další změnou načtěte administraci znovu."); }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        onAuthRequired();
        setError("Přihlášení vypršelo. Přihlaste se znovu v nové kartě; důvod zrušení zde zůstane vyplněný.");
      } else {
        setError(failure instanceof Error ? failure.message : "Zrušení se nepodařilo dokončit. Před dalším pokusem ověříme aktuální stav termínu.");
      }
    } finally { submitLock.current = false; setPhase("idle"); onWorkingChange?.(false); }
  }

  return <section className="admin-card admin-single-cancel" aria-labelledby="single-cancel-title">
    <h2 id="single-cancel-title" tabIndex={-1}>Zrušit jeden termín</h2>
    <p>Instruktor nemůže nebo se jedna lekce nekoná? Vyberte datum a konkrétní termín. Ostatní dny i pravidelný plán zůstanou zachované.</p>
    <ol className="admin-cancel-steps" aria-label="Postup zrušení termínu">
      <li>Vyberte datum.</li><li>Vyberte lekci.</li><li>Zkontrolujte údaje a potvrďte zrušení.</li>
    </ol>
    <details className="admin-guide"><summary>Jak zrušit lekci s předstihem?</summary>
      <p>V Rozvrhu můžete pracovat s vypsanými termíny až tři měsíce dopředu, i když se na ně ještě nedá rezervovat. V sekci Rezervace je rychlý seznam jen na nejbližších 14 dní.</p>
      <p>Zrušený termín se automaticky neotevře znovu. Pokud chcete zrušit delší období nebo celou řadu, použijte níže „Upravit pravidelnou lekci“.</p>
    </details>
    <div className="admin-form"><label>Datum lekce<input ref={dateInput} type="date" min={studioSessionDate(new Date().toISOString())} value={date} disabled={disabled} onChange={(event) => { setDate(event.target.value); resetSelection(); setSuccess(undefined); }} /></label></div>
    {success && <p className="admin-message" role="status">{success}</p>}
    {!selected && <div aria-live="polite">
      {items.length ? <ul className="admin-cancel-options">{items.map((item) => <li key={item.id}><div><strong>{item.className}</strong><span>{lessonDate(item)} · {lessonTime(item)} · {item.instructorName}</span></div><button type="button" disabled={disabled} onClick={() => selectSession(item)}>Vybrat tento termín</button></li>)}</ul>
        : <p className="admin-empty">{date ? "Na toto datum není vypsaný žádný budoucí termín ke zrušení. Zkuste jiné datum; zrušené lekce se nenabízejí." : "Nejprve vyberte datum lekce."}</p>}
    </div>}
    {selected && <form className="admin-form admin-cancel-confirmation" onSubmit={(event) => void cancel(event)}>
      <h3 ref={confirmationHeading} tabIndex={-1}>Kontrola zrušení jednoho termínu</h3>
      <dl><div><dt>Lekce</dt><dd>{selected.className}</dd></div><div><dt>Datum a čas</dt><dd>{lessonDate(selected)} · {lessonTime(selected)}</dd></div><div><dt>Instruktor</dt><dd>{selected.instructorName}</dd></div><div><dt>Rezervace</dt><dd>Aktuálně {selected.bookingCount}</dd></div></dl>
      <p>Zruší se pouze tento termín. Všechny rezervace přihlášené v okamžiku zrušení se zruší bez storno poplatku. Klienti s rezervací dostanou zprávu ve svém účtu.</p>
      <p className="admin-form-note">Počet rezervací se může mezitím změnit. Automatické doplňování rozvrhu tuto lekci znovu neotevře.</p>
      <label>Důvod zrušení pro klienty<textarea aria-describedby="single-cancel-reason-help" required minLength={3} maxLength={1000} rows={3} disabled={disabled} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Např. Lekce se nekoná z důvodu nepřítomnosti instruktora." /></label>
      <p className="admin-form-note" id="single-cancel-reason-help">Napište krátké vysvětlení v délce 3 až 1 000 znaků. Tento text uvidí klienti s rezervací.</p>
      {selectedUnavailable && <p role="alert">Tento termín už není budoucí naplánovanou lekcí. Vyberte jiný termín.</p>}
      <label className="admin-check"><input type="checkbox" required checked={confirmed} disabled={disabled || Boolean(selectedUnavailable)} onChange={(event) => setConfirmed(event.target.checked)} /><span>Chci zrušit pouze tento termín a jeho rezervace bez poplatku.</span></label>
      <div className="admin-row-actions"><button type="button" disabled={disabled} onClick={resetSelection}>Ponechat termín</button><button className="button" type="submit" disabled={disabled || Boolean(selectedUnavailable) || !confirmed}>{phase === "checking" ? "Ověřuji aktuální stav…" : phase === "cancelling" ? "Ruším termín…" : "Potvrdit zrušení tohoto termínu"}</button></div>
    </form>}
    {error && <p className="admin-cancel-error" role="alert">{error}</p>}
  </section>;
}

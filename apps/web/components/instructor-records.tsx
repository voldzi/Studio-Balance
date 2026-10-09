"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiRequest, formatStudioDate } from "../lib/api-types";
import { hours, instructorRecordsCsv, reward, studioInput, studioInstant, studioMonth, type Completion, type InstructorReport } from "../lib/instructor-records";

type Instructor = { id: string; displayName: string; active: boolean };
type AuthProps = { onAuthRequired: () => void };
const dateFormat = { weekday: "long", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" } as const;

export function SessionCompletionEditor({ sessionId, instructors, onSaved, onAuthRequired, rosterRevision = 0 }: AuthProps & { sessionId: string; instructors: Instructor[]; onSaved: () => void; rosterRevision?: number }) {
  const [data, setData] = useState<Completion>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [absent, setAbsent] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [loadedRevision, setLoadedRevision] = useState(rosterRevision);
  const stale = loadedRevision !== rosterRevision;
  function reloadCurrent() { setLoadedRevision(rosterRevision); setReload((value) => value + 1); }
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(undefined); setData(undefined); setAbsent([]);
    void apiRequest<Completion>(`/api/v1/admin/sessions/${sessionId}/completion`).then((result) => { if (!cancelled) setData(result); }).catch((cause: unknown) => {
      if (cancelled) return;
      if (cause instanceof ApiError && cause.status === 401) onAuthRequired();
      setError(cause instanceof Error ? cause.message : "Lekci se nepodařilo načíst.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, reload, onAuthRequired]);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data || stale) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(undefined); setSuccess(undefined);
    try {
      const startAt = studioInstant(String(form.get("startAt")), data.record?.startAt ?? data.session.startAt);
      const duration = Number(form.get("minutes"));
      if (!Number.isInteger(duration) || duration < 15 || duration > 240) throw new Error("Délka vedení musí být 15 až 240 minut.");
      const amount = String(form.get("reward") ?? "").trim();
      if (amount && !/^\d+(?:[.,]\d{1,2})?$/.test(amount)) throw new Error("Odměnu zadejte jako částku v Kč, nebo ji nechte k doplnění.");
      const result = await apiRequest<{ attendedCount: number; noShowCount: number }>(`/api/v1/admin/sessions/${sessionId}/completion`, { method: "POST", body: JSON.stringify({
        instructorId: form.get("instructorId"), startAt, endAt: new Date(new Date(startAt).getTime() + duration * 60_000).toISOString(),
        rewardCents: amount ? Math.round(Number(amount.replace(",", ".")) * 100) : null,
        absentBookingIds: absent, rosterToken: data.rosterToken, expectedVersion: data.record?.version ?? null, reason: form.get("reason")
      }) });
      setSuccess(`Lekce byla potvrzena: ${result.attendedCount} účastí, ${result.noShowCount} neúčastí. Výkaz instruktora byl uložen.`);
      setReload((value) => value + 1); onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthRequired();
      setError(cause instanceof Error ? cause.message : "Potvrzení lekce se nepodařilo. Zkuste to znovu.");
    } finally { setBusy(false); }
  }
  return <section className="admin-completion" aria-label="Potvrzení lekce a výkaz instruktora">
    <h3>Potvrdit lekci a docházku</h3>
    {data && <p><strong>{data.session.className}</strong> · {formatStudioDate(data.session.startAt, dateFormat)}</p>}
    <p>Po lekci označte jen ty, kteří nepřišli. Ostatní dosud rezervovaní budou potvrzeni najednou. Již vyhodnocené osoby opravujte jednotlivě v seznamu přihlášených.</p>
    {success && <p className="admin-feedback" role="status">{success}</p>}
    {error && <p className="admin-feedback" role="alert">{error}</p>}
    {loading ? <p role="status">Načítám údaje lekce…</p> : !data ? <button onClick={reloadCurrent} type="button">Zkusit znovu</button> : <CompletionForm key={`${sessionId}:${data.record?.version ?? 0}:${reload}`} data={data} instructors={instructors} absent={absent} setAbsent={setAbsent} busy={busy} stale={stale} onSubmit={confirm} onReload={reloadCurrent} />}
  </section>;
}

export function CompletionForm({ data, instructors, absent, setAbsent, busy, stale = false, onSubmit, onReload }: { data: Completion; instructors: Instructor[]; absent: string[]; setAbsent: (ids: string[]) => void; busy: boolean; stale?: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReload: () => void }) {
  const available = instructors.filter((item) => item.active || item.id === (data.record?.instructorId ?? data.session.instructorId));
  const unprocessed = data.bookings.filter((item) => item.status === "reserved");
  const ended = new Date(data.session.endAt).getTime() <= Date.now();
  const cancelled = data.session.status === "cancelled";
  return <form className="admin-form" onSubmit={onSubmit}>
    {stale && <p role="alert" className="admin-feedback">Docházka byla mezitím upravena jednotlivě. Nejdříve načtěte aktuální údaje a znovu zkontrolujte nepřítomné. Načtení nahradí rozepsaný formulář.</p>}
    {!ended && <p className="admin-form-note">Potvrzení bude dostupné po skončení lekce. Rezervace do té doby zůstávají rezervacemi.</p>}
    {cancelled && <p className="admin-form-note">Zrušenou lekci nelze potvrdit jako odvedenou.</p>}
    {data.record?.attendanceChanged && <p role="status" className="admin-feedback">Od posledního potvrzení se změnila docházka. Zkontrolujte odměnu; sama se nepřepočítala.</p>}
    <fieldset disabled={busy || !ended || cancelled}><legend>Nepřišli na lekci</legend>
      {unprocessed.length ? unprocessed.map((item) => <label className="admin-check" key={item.id}><input checked={absent.includes(item.id)} onChange={(event) => setAbsent(event.target.checked ? [...absent, item.id] : absent.filter((id) => id !== item.id))} type="checkbox" />{item.participantKind === "companion" ? `${item.participantName ?? "Doprovod"} · doprovod (${item.ownerName})` : item.ownerName}</label>) : <p>Všechny platné rezervace už mají docházku vyhodnocenou, nebo na lekci nejsou žádné rezervace.</p>}
    </fieldset>
    <p className="admin-form-note">Počet nově potvrzených účastí: {unprocessed.length - absent.length}. U {absent.length} označených neúčastí platí poplatek ve výši ceny jejich místa; uhrazené a prominuté poplatky se nepřepisují.</p>
    <fieldset className="admin-form-grid" disabled={busy || !ended || cancelled}><legend>Provozní výkaz instruktora</legend>
      <label>Skutečný instruktor<select defaultValue={data.record?.instructorId ?? data.session.instructorId} name="instructorId" required>{available.map((item) => <option key={item.id} value={item.id}>{item.displayName}{item.active ? "" : " (archivovaný)"}</option>)}</select></label>
      <label>Začátek vedení (čas v ČR)<input defaultValue={studioInput(data.record?.startAt ?? data.session.startAt)} name="startAt" required type="datetime-local" /></label>
      <label>Délka vedení (min)<input defaultValue={data.record?.minutes ?? Math.round((new Date(data.session.endAt).getTime() - new Date(data.session.startAt).getTime()) / 60_000)} max="240" min="15" name="minutes" required step="1" type="number" /></label>
      <label>Odměna za lekci (Kč)<input defaultValue={data.record?.rewardCents == null ? "" : data.record.rewardCents / 100} max="10000" min="0" name="reward" placeholder="Např. 350; prázdné = k doplnění" step="0.01" type="number" /></label>
      <label className="admin-wide-field">Poznámka / důvod opravy<textarea defaultValue={data.record ? "" : "Lekce proběhla, docházka byla ověřena."} maxLength={1000} minLength={3} name="reason" required /></label>
    </fieldset>
    <p className="admin-form-note">Jde o čas vedení lekce a podklad pro odměnu. Přípravu a další práci na DPP evidujte zvlášť. Částka není potvrzení vyplacení.</p>
    <div className="admin-row-actions"><button className="button button-small" disabled={busy || stale || !ended || cancelled} type="submit">{busy ? "Ukládám…" : data.record ? "Uložit opravu výkazu" : "Potvrdit účast ostatních a uložit lekci"}</button><button disabled={busy} onClick={onReload} type="button">Načíst aktuální údaje</button></div>
  </form>;
}

export function InstructorRecords({ instructors, onSaved, onAuthRequired }: AuthProps & { instructors: Instructor[]; onSaved: () => void }) {
  const [month, setMonth] = useState(studioMonth);
  const [report, setReport] = useState<InstructorReport>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>();
  const [reload, setReload] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  function selectSession(id: string) {
    setSelected(id);
    requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
  }
  const refresh = useCallback(() => { setReload((value) => value + 1); onSaved(); }, [onSaved]);
  useEffect(() => {
    let cancelled = false; setLoading(true); setReport(undefined); setError(undefined);
    void apiRequest<InstructorReport>(`/api/v1/admin/instructor-records?month=${encodeURIComponent(month)}`).then((result) => { if (!cancelled) setReport(result); }).catch((cause: unknown) => {
      if (cancelled) return;
      if (cause instanceof ApiError && cause.status === 401) onAuthRequired();
      setError(cause instanceof Error ? cause.message : "Výkaz se nepodařilo načíst.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, reload, onAuthRequired]);
  function exportCsv() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([instructorRecordsCsv(report)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `vykaz-instruktoru-${month}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="admin-instructor-records"><p className="eyebrow">Odvedené lekce</p><h1>Výkaz instruktorů</h1>
    <p>Potvrzené vedení lekcí a zadané odměny. Plánované či zrušené termíny se do souhrnu nepočítají.</p>
    <div className="admin-row-actions"><label>Měsíc<input max="2099-12" min="2000-01" onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setSelected(undefined); } }} type="month" value={month} /></label><button disabled={loading || !report} onClick={exportCsv} type="button">Stáhnout CSV</button><button disabled={loading || !report} onClick={() => window.print()} type="button">Tisknout výkaz</button></div>
    {error && <p role="alert">{error} <button onClick={() => setReload((value) => value + 1)} type="button">Zkusit znovu</button></p>}
    {loading && <p role="status">Načítám měsíční výkaz…</p>}
    {report && <InstructorReportView report={report} onSelect={selectSession} />}
    {selected && <div ref={editorRef} tabIndex={-1}><SessionCompletionEditor key={selected} sessionId={selected} instructors={instructors} onSaved={refresh} onAuthRequired={onAuthRequired} /></div>}
  </section>;
}

export function InstructorReportView({ report, onSelect }: { report: InstructorReport; onSelect: (id: string) => void }) {
  return <>
    <h2>Měsíční souhrn</h2>
    <p>Období: {report.month}</p>
    <p className={report.unconfirmedSessions.length ? "admin-feedback" : "admin-form-note"}>{report.unconfirmedSessions.length ? `Výkaz není úplný: ${report.unconfirmedSessions.length} minulých lekcí zbývá ověřit. Nejsou zahrnuté v součtu hodin ani odměn.` : "Všechny minulé nezrušené lekce tohoto měsíce mají potvrzený výkaz."}</p>
    {!report.summary.length && <p>V tomto měsíci zatím není potvrzená žádná odvedená lekce.</p>}
    <div className="admin-report-summaries">{report.summary.map((item) => <article className="admin-card" key={item.instructorId}><h3>{item.instructorName}</h3><p>{item.lessons} lekcí · {hours(item.minutes)} hodin vedení</p><p>Součet zadaných odměn: <strong>{reward(item.rewardCents)}</strong></p>{item.pendingRewards > 0 && <p role="status">Odměna zbývá doplnit u {item.pendingRewards} lekcí.</p>}</article>)}</div>
    <h2>Potvrzené lekce</h2>
    <div className="admin-report-table" tabIndex={0} role="region" aria-label="Potvrzené lekce – tabulka posuvná do stran"><table><thead><tr><th scope="col">Datum a lekce</th><th scope="col">Instruktor</th><th scope="col">Hodiny</th><th scope="col">Účast</th><th scope="col">Odměna</th><th scope="col">Úprava</th></tr></thead><tbody>{report.records.map((item) => <tr key={item.id}><td>{formatStudioDate(item.startAt, dateFormat)}<br />{item.className}</td><td>{item.instructorName}</td><td>{hours(item.minutes)}</td><td>{item.participants}</td><td>{reward(item.rewardCents)}{item.attendanceChanged && <p className="admin-form-note">Docházka se změnila; zkontrolujte odměnu.</p>}</td><td><button onClick={() => onSelect(item.sessionId)} type="button">Upravit výkaz</button></td></tr>)}</tbody></table></div>
    <details className="admin-help-card" open={report.unconfirmedSessions.length > 0}><summary>K doplnění: {report.unconfirmedSessions.length} minulých lekcí</summary><p>Potvrďte jen lekce, které skutečně proběhly. Minulý termín se automaticky nepovažuje za odvedený.</p><ul className="admin-simple-list">{report.unconfirmedSessions.map((item) => <li key={item.id}><div><strong>{item.className}</strong><span>{formatStudioDate(item.startAt, dateFormat)} · {item.instructorName}</span></div><button onClick={() => onSelect(item.id)} type="button">Potvrdit lekci</button></li>)}</ul></details>
  </>;
}

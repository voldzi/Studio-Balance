"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, formatStudioDate } from "../lib/api-types";

export type ReviewSubmissionStatus = "pending" | "approved" | "rejected";
export type AdminReviewSubmission = {
  id: string; authorLabel: string; body: string; rating: number | null; status: ReviewSubmissionStatus;
  createdAt: string; moderatedAt: string | null; moderationReason: string | null; reviewId: string | null;
  consentVersion: string; consentedAt: string;
};
type Decision = { item: AdminReviewSubmission; decision: "approve" | "reject" };
const statusLabels: Record<ReviewSubmissionStatus, string> = { pending: "Čekající na kontrolu", approved: "Schválené", rejected: "Nezveřejněné" };

export function ReviewSubmissionCard({ item }: { item: AdminReviewSubmission }) {
  return <div className="admin-submission-original">
    <strong>{item.authorLabel}</strong>
    <p className="admin-submission-body">{item.body}</p>
    <p>{item.rating === null ? "Bez hvězdiček" : `Hodnocení ${item.rating} z 5`}</p>
  </div>;
}

export function ReviewDecisionForm({ selection, disabled, featured, reason, confirmed, onFeatured, onReason, onConfirmed, onCancel, onSubmit }: {
  selection: Decision; disabled: boolean; featured: boolean; reason: string; confirmed: boolean;
  onFeatured: (value: boolean) => void; onReason: (value: string) => void; onConfirmed: (value: boolean) => void;
  onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const approving = selection.decision === "approve";
  return <form className="admin-form admin-review-decision" onSubmit={onSubmit}>
    <h3>{approving ? "Kontrola před zveřejněním" : "Proč recenzi nezveřejnit?"}</h3>
    <ReviewSubmissionCard item={selection.item} />
    {approving ? <>
      <p>Na webu se zobrazí přesně uvedené jméno, text a případné hodnocení. Text klienta ani počet hvězdiček se neupravují.</p>
      <label className="admin-check"><input type="checkbox" checked={featured} disabled={disabled} onChange={(event) => onFeatured(event.target.checked)} /><span>Zvýraznit také na hlavní stránce</span></label>
      <label className="admin-check"><input type="checkbox" required checked={confirmed} disabled={disabled} onChange={(event) => onConfirmed(event.target.checked)} /><span>Zkontrolovala jsem obsah a chci recenzi zveřejnit v tomto znění.</span></label>
    </> : <>
      <label>Důvod nezveřejnění<textarea name="moderationReason" value={reason} required minLength={3} maxLength={500} disabled={disabled} rows={3} onChange={(event) => onReason(event.target.value)} aria-describedby="review-rejection-help" /></label>
      <p className="admin-form-note" id="review-rejection-help">Například spam, urážky nebo osobní údaje jiné osoby. Důvod zůstane pouze v administraci. Samotné nízké hodnocení není důvodem k odmítnutí.</p>
    </>}
    <div className="admin-row-actions"><button type="button" disabled={disabled} onClick={onCancel}>Zpět bez změny</button><button className="button" type="submit" disabled={disabled || (approving ? !confirmed : reason.trim().length < 3)}>{disabled ? "Ukládáme rozhodnutí…" : approving ? "Potvrdit zveřejnění recenze" : "Potvrdit nezveřejnění"}</button></div>
  </form>;
}

export function ReviewSubmissions({ busy, onAuthRequired, onModerated, onWorkingChange }: {
  busy: boolean; onAuthRequired: () => void; onModerated: () => Promise<void>; onWorkingChange?: (working: boolean) => void;
}) {
  const [status, setStatus] = useState<ReviewSubmissionStatus>("pending");
  const [items, setItems] = useState<AdminReviewSubmission[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [selection, setSelection] = useState<Decision | null>(null);
  const [featured, setFeatured] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const decisionRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const decisionLock = useRef(false);
  const disabled = busy || saving;

  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current;
    setLoading(true); setError(undefined);
    try {
      const result = await apiRequest<{ items: AdminReviewSubmission[]; pendingCount: number }>(`/api/v1/admin/content/review-submissions?status=${status}`, { signal: signal ?? null });
      if (!mounted.current || signal?.aborted || current !== generation.current) return;
      setItems(result.items); setPendingCount(result.pendingCount);
    } catch (failure) {
      if (!mounted.current || signal?.aborted || current !== generation.current) return;
      if (failure instanceof ApiError && failure.status === 401) { onAuthRequired(); setError("Přihlášení vypršelo. Přihlaste se v nové kartě, potom zde obnovte seznam. Rozepsaný důvod zůstane zachovaný."); }
      else if (failure instanceof ApiError && failure.status === 403) setError("K recenzím nemáte oprávnění. Obraťte se na správce studia.");
      else setError("Recenze od klientů se nepodařilo načíst. Zkuste seznam obnovit.");
    } finally { if (mounted.current && !signal?.aborted && current === generation.current) setLoading(false); }
  }, [status, onAuthRequired]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => { mounted.current = false; controller.abort(); };
  }, [load, refresh]);
  useEffect(() => { if (error || success) resultRef.current?.focus(); }, [error, success]);

  function select(item: AdminReviewSubmission, decision: Decision["decision"]) {
    setSelection({ item, decision }); setFeatured(false); setReason(""); setConfirmed(false); setError(undefined); setSuccess(undefined);
    requestAnimationFrame(() => decisionRef.current?.focus());
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || disabled || decisionLock.current) return;
    if (selection.decision === "approve" && !confirmed) { setError("Nejprve potvrďte kontrolu přesného znění recenze."); return; }
    if (selection.decision === "reject" && (reason.trim().length < 3 || reason.trim().length > 500)) { setError("Napište důvod v délce 3 až 500 znaků."); return; }
    decisionLock.current = true; setSaving(true); onWorkingChange?.(true); setError(undefined); setSuccess(undefined);
    try {
      await apiRequest(`/api/v1/admin/content/review-submissions/${encodeURIComponent(selection.item.id)}/decision`, {
        method: "POST", body: JSON.stringify({ decision: selection.decision, featured: selection.decision === "approve" && featured, reason: selection.decision === "reject" ? reason.trim() : null })
      });
      if (!mounted.current) return;
      setSuccess(selection.decision === "approve" ? "Recenze byla schválena a zveřejněna v původním znění." : "Recenze nebyla zveřejněna. Rozhodnutí a důvod zůstávají v administraci.");
      setSelection(null); setReason(""); setConfirmed(false); setFeatured(false);
      await load();
      try { await onModerated(); }
      catch { setError("Rozhodnutí je uložené, ale veřejný přehled recenzí v administraci se nepodařilo obnovit. Obnovte jej prosím znovu."); }
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 401) { onAuthRequired(); setError("Přihlášení vypršelo. Přihlaste se znovu v nové kartě; znění i rozepsaný důvod zůstávají zachované."); }
      else if (failure instanceof ApiError && failure.status === 403) setError("K rozhodnutí o recenzi nemáte oprávnění. Žádnou změnu jsme neprovedli.");
      else if (failure instanceof ApiError && failure.status === 409) {
        setSelection(null); setConfirmed(false); await load();
        setError("O této recenzi už mezitím někdo rozhodl. Seznam jsme obnovili; aktuální výsledek najdete mezi schválenými nebo nezveřejněnými recenzemi.");
      } else setError("Rozhodnutí se nepodařilo ověřit. Nejprve obnovte seznam a zkontrolujte stav recenze. Neodesíláme jej znovu automaticky.");
    } finally { decisionLock.current = false; if (mounted.current) setSaving(false); onWorkingChange?.(false); }
  }

  return <section className="admin-card admin-review-submissions" aria-labelledby="client-reviews-title">
    <div className="admin-submissions-heading"><div><p className="eyebrow">Přímo od klientů</p><h2 id="client-reviews-title">Recenze čekající na kontrolu{pendingCount !== null ? ` (${pendingCount})` : ""}</h2></div><button type="button" disabled={disabled || loading} onClick={() => setRefresh((value) => value + 1)}>Obnovit seznam</button></div>
    <p>Klienti napíšou recenzi na webu nebo načtou QR kód ve studiu. Tady ji zkontrolujete a jedním rozhodnutím zveřejníte, bez přepisování.</p>
    <div className="admin-row-actions"><a href="/recenze/napsat" target="_blank" rel="noopener noreferrer">Otevřít formulář pro klienty</a><a href="/recenze/qr" target="_blank" rel="noopener noreferrer">QR kód pro studio a tisk</a></div>
    <details className="admin-guide"><summary>Jak spravovat recenze?</summary><ol><li>Vyberte čekající recenzi a klikněte na „Zveřejnit“.</li><li>Zkontrolujte přesné jméno, text a hodnocení. Volitelně ji zvýrazněte i na hlavní stránce.</li><li>Potvrďte zveřejnění. Klient už souhlasil s publikací těchto údajů.</li></ol><p>Nezveřejňujte spam, urážky ani osobní údaje jiných lidí a zapište důvod. Samotná kritika nebo nízké hodnocení není důvod k odmítnutí. Původní text a hodnocení klienta se neupravují. Návštěvu studia formulář neověřuje.</p><p>QR kód můžete vytisknout a vystavit ve studiu. Otevře stejný formulář jako web; klient píše recenzi na svém telefonu.</p></details>
    <div className="admin-form"><label>Stav recenzí<select value={status} disabled={disabled} onChange={(event) => { setStatus(event.target.value as ReviewSubmissionStatus); setItems([]); setSelection(null); setSuccess(undefined); setError(undefined); }}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    {success && <p className="admin-message" role="status" ref={resultRef} tabIndex={-1}>{success}</p>}
    {error && <p className="admin-cancel-error" role="alert" ref={resultRef} tabIndex={-1}>{error}</p>}
    {loading ? <p role="status">Načítáme recenze od klientů…</p> : <>
      {!items.length && !error && <p className="admin-empty">{status === "pending" ? "Žádná recenze teď nečeká na kontrolu. Jakmile ji klient odešle, najdete ji tady." : status === "approved" ? "Zatím jste neschválili žádnou recenzi od klientů." : "Žádná recenze nebyla označena jako nezveřejněná."}</p>}
      {status === "pending" && pendingCount !== null && pendingCount > items.length && items.length > 0 && <p className="admin-form-note">Zobrazeno {items.length} nejstarších čekajících recenzí. Po jejich vyřízení obnovte seznam pro další.</p>}
      <ul className="admin-submission-list">{items.map((item) => <li key={item.id}><ReviewSubmissionCard item={item} /><p className="admin-form-note">Odesláno {formatStudioDate(item.createdAt, { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })} · Souhlas se zveřejněním zaznamenán.</p>{item.status === "pending" && <div className="admin-row-actions"><button className="button button-small" disabled={disabled} type="button" onClick={() => select(item, "approve")}>Zveřejnit</button><button disabled={disabled} type="button" onClick={() => select(item, "reject")}>Nezveřejnit</button></div>}{item.moderatedAt && <p className="admin-form-note">{statusLabels[item.status]} {formatStudioDate(item.moderatedAt, { day: "numeric", month: "numeric", year: "numeric" })}{item.moderationReason ? ` · Důvod: ${item.moderationReason}` : ""}</p>}</li>)}</ul>
    </>}
    {selection && <div ref={decisionRef} tabIndex={-1}><ReviewDecisionForm selection={selection} disabled={disabled} featured={featured} reason={reason} confirmed={confirmed} onFeatured={setFeatured} onReason={setReason} onConfirmed={setConfirmed} onCancel={() => setSelection(null)} onSubmit={(event) => void decide(event)} /></div>}
  </section>;
}

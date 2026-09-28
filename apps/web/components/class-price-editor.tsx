"use client";

import { FormEvent, useState } from "react";
import { ApiError, apiRequest } from "../lib/api-types";

type ClassType = { active: boolean; id: string; name: string };
type PricePreview = {
  className: string;
  weeklyRulesChanged: number;
  sessionsChanged: number;
  activeBookings: number;
  bookedPricesChanged: number;
  blockedBookings: number;
  previewToken: string;
};
type PriceInput = { classTypeId: string; priceCents: number; updateBookedPrices: boolean; reason: string };

export function ClassPriceEditor({ classTypes, busy, onApplied }: {
  classTypes: ClassType[]; busy: boolean; onApplied: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<{ input: PriceInput; result: PricePreview } | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [expired, setExpired] = useState(false);

  async function showPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("price"));
    if (!Number.isFinite(amount) || !Number.isInteger(amount * 100) || amount < 0 || amount > 10_000) {
      setMessage("Zadejte cenu v Kč, nejvýše se dvěma desetinnými místy.");
      return;
    }
    const input: PriceInput = {
      classTypeId: String(form.get("classTypeId")), priceCents: Math.round(amount * 100),
      updateBookedPrices: form.get("updateBookedPrices") === "on", reason: String(form.get("reason") ?? "").trim()
    };
    setWorking(true); setMessage(""); setPreview(null);
    try {
      const result = await apiRequest<PricePreview>("/api/v1/admin/prices/preview", { method: "POST", body: JSON.stringify(input) });
      setPreview({ input, result }); setExpired(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setExpired(true);
      setMessage(error instanceof Error ? error.message : "Dopad změny se nepodařilo načíst.");
    } finally { setWorking(false); }
  }

  async function apply() {
    if (!preview) return;
    const { input, result } = preview;
    if (!window.confirm(`Nastavit cenu ${result.className} na ${(input.priceCents / 100).toLocaleString("cs-CZ")} Kč? Změní se ${result.weeklyRulesChanged} pravidelných časů a ${result.sessionsChanged} budoucích termínů.${input.updateBookedPrices ? ` Změní se také cena ${result.bookedPricesChanged} potvrzených rezervací.` : " Ceny potvrzených rezervací zůstanou beze změny."}`)) return;
    setWorking(true); setMessage("");
    try {
      await apiRequest("/api/v1/admin/prices/apply", {
        method: "POST", body: JSON.stringify({ ...input, previewToken: result.previewToken })
      });
      setPreview(null);
      setMessage("Cena byla uložena pro pravidelný plán a budoucí termíny. Zkontrolujte ji v rozvrhu.");
      setExpired(false);
      await onApplied();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setExpired(true);
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "Cenu se nepodařilo uložit. Zkontrolujte dopad znovu.");
    } finally { setWorking(false); }
  }

  return <details className="admin-create">
    <summary>Změnit cenu celé lekce</summary>
    <form className="admin-form admin-form-grid" onChange={() => setPreview(null)} onSubmit={(event) => void showPreview(event)}>
      <p className="admin-form-note admin-form-wide">Nová cena platí pro všechny pravidelné časy dané lekce a její budoucí termíny. Minulé lekce ani zrušené rezervace se nemění. Cenu už potvrzených rezervací lze změnit jen výslovnou volbou níže.</p>
      <label><span className="admin-label-row">Lekce</span><select name="classTypeId" required>{classTypes.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span className="admin-label-row">Nová cena (Kč)</span><input min="0" max="10000" name="price" required step="0.01" type="number" /></label>
      <label className="admin-form-wide"><span className="admin-label-row">Důvod změny</span><textarea maxLength={1000} minLength={3} name="reason" required rows={2} placeholder="Např. Nový ceník lekcí od října." /></label>
      <label className="admin-check admin-form-wide"><input name="updateBookedPrices" type="checkbox" /><span>Změnit také cenu už potvrzených budoucích rezervací a informovat klientky v jejich účtu</span></label>
      <p className="admin-form-note admin-form-wide">Bez zaškrtnutí si klientky s rezervací ponechají cenu platnou při přihlášení. Změna potvrzené rezervace může změnit i případný budoucí storno poplatek.</p>
      <div className="admin-row-actions"><button className="button" disabled={busy || working} type="submit">Zkontrolovat dopad změny</button></div>
    </form>
    {preview && <div className="admin-data-card" role="status">
      <h3>Co se změní</h3>
      <p><strong>{preview.result.className}: {(preview.input.priceCents / 100).toLocaleString("cs-CZ")} Kč</strong></p>
      <p>{preview.result.weeklyRulesChanged} pravidelných časů · {preview.result.sessionsChanged} budoucích termínů včetně zrušených, které jsou v rozvrhu stále vidět.</p>
      <p>{preview.input.updateBookedPrices ? `${preview.result.bookedPricesChanged} z ${preview.result.activeBookings} aktivních rezervací změní cenu a klientky dostanou zprávu v účtu.` : `${preview.result.activeBookings} aktivních rezervací si ponechá původní cenu.`}</p>
      {preview.result.blockedBookings > 0 ? <p role="alert">U {preview.result.blockedBookings} rezervací existuje storno poplatek. Změnu ceny potvrzených rezervací nelze uložit hromadně.</p> : <button className="button" disabled={busy || working} onClick={() => void apply()} type="button">Potvrdit změnu ceny</button>}
    </div>}
    {expired && <p role="alert">Přihlášení vypršelo. <a href="/admin/prihlaseni" rel="noopener noreferrer" target="_blank">Přihlaste se v nové kartě</a> a dopad změny zkontrolujte znovu.</p>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </details>;
}

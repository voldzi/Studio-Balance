"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, formatStudioDate } from "../lib/api-types";
export type AdminCancellationPreview = {sessionId:string;className:string;startAt:string;hasOtherParticipant:boolean;
  items:{id:string;name:string;participantKind:"self"|"companion";mode:string;feeCents:number;payableCents:number}[];
  totalFeeCents:number;releasedPlaces:number;previewToken:string};
type Input={scope:"one"|"both";feePolicy:"standard"|"waive";reason:string;waiverReason?:string|undefined};
export function AdminBookingCancellation({bookingId,onClose,onSaved,onAuthRequired}: {
  bookingId:string;onClose:()=>void;onSaved:()=>Promise<void>;onAuthRequired:()=>void;
}) {
  const [input,setInput]=useState<Input>({scope:"one",feePolicy:"standard",reason:"Odhlášení na žádost klienta."});
  const [preview,setPreview]=useState<AdminCancellationPreview>();
  const [hasOther,setHasOther]=useState(false);
  const [working,setWorking]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState<string>();
  const [done,setDone]=useState(false);
  const lock=useRef(false);
  const mounted=useRef(true);
  const heading=useRef<HTMLHeadingElement>(null);
  const receiptKey=useRef<string|undefined>(undefined);
  function change(patch:Partial<Input>) {setInput({...input,...patch});setPreview(undefined);setConfirmed(false);setError(undefined);receiptKey.current=undefined;}
  function failure(e:unknown) {
    if(e instanceof ApiError && e.status===401) onAuthRequired();
    setError(e instanceof Error?e.message:"Odhlášení se nepodařilo ověřit. Zkontrolujte aktuální stav rezervace.");
  }
  async function check(data:Input) {
    if(lock.current)return;
    lock.current=true;setWorking(true);setError(undefined);setConfirmed(false);
    try {const p=await apiRequest<AdminCancellationPreview>(`/api/v1/admin/bookings/${bookingId}/cancellation-preview`,{method:"POST",body:JSON.stringify(data)});
      if(mounted.current){setPreview(p);setHasOther(p.hasOtherParticipant);receiptKey.current=crypto.randomUUID();}}
    catch(e){if(mounted.current)failure(e);}
    finally{lock.current=false;if(mounted.current)setWorking(false);}
  }
  useEffect(()=>{mounted.current=true;heading.current?.focus();void check({scope:"one",feePolicy:"standard",reason:"Odhlášení na žádost klienta."});return()=>{mounted.current=false;};},[bookingId]);
  async function apply() {
    if(!preview||!confirmed||lock.current||!receiptKey.current)return;
    lock.current=true;setWorking(true);setError(undefined);
    try {
      await apiRequest(`/api/v1/admin/bookings/${bookingId}/cancel`,{method:"POST",body:JSON.stringify({...input,previewToken:preview.previewToken,idempotencyKey:receiptKey.current})});
      if(mounted.current){setDone(true);try { await onSaved(); } catch { if(mounted.current)setError("Odhlášení je uložené, ale přehled se nepodařilo obnovit. Načtěte administraci znovu."); }}
    }catch(e){if(mounted.current){failure(e);if(e instanceof ApiError&&e.status===409){setPreview(undefined);setConfirmed(false);receiptKey.current=undefined;}}}
    finally{lock.current=false;if(mounted.current)setWorking(false);}
  }
  return <section className="admin-data-card admin-form-wide admin-booking-cancellation" aria-labelledby={`cancel-booking-${bookingId}`}>
    <h3 id={`cancel-booking-${bookingId}`} ref={heading} tabIndex={-1}>Odhlásit klienta</h3>
    {error&&<p role="alert" className="admin-message">{error}</p>}
    {done?<><p role="status">Odhlášení je uložené a místo bylo uvolněno. Klient dostane oznámení ve svém účtu.</p><button type="button" onClick={onClose}>Zavřít</button></>:<>
      <p>Odhlásíte vybranou osobu, celá lekce zůstane zachovaná. Další zájemce se může zapsat, pokud jsou rezervace ještě otevřené.</p>
      <form className="admin-form" onSubmit={e=>{e.preventDefault();void check(input);}}>
        <label>Koho odhlásit<select value={input.scope} disabled={working} onChange={e=>change({scope:e.target.value as Input["scope"]})}>
          <option value="one">Pouze tuto osobu</option>{hasOther&&<option value="both">Klienta i jeho doprovod (obě místa)</option>}
        </select></label>
        <label>Důvod odhlášení<textarea required minLength={3} maxLength={1000} value={input.reason} disabled={working} onChange={e=>change({reason:e.target.value})}/></label>
        <label className="admin-check"><input type="checkbox" checked={input.feePolicy==="waive"} disabled={working} onChange={e=>change({feePolicy:e.target.checked?"waive":"standard",waiverReason:undefined})}/> Výslovně prominout případný storno poplatek</label>
        {input.feePolicy==="waive"&&<label>Důvod prominutí poplatku<textarea required minLength={3} maxLength={1000} value={input.waiverReason??""} disabled={working} onChange={e=>change({waiverReason:e.target.value})}/></label>}
        {!preview&&<button className="button button-small" disabled={working} type="submit">{working?"Ověřuji…":"Zkontrolovat odhlášení"}</button>}
      </form>
      {preview&&<div className="admin-data-card">
        <p><strong>{preview.className}</strong> · {formatStudioDate(preview.startAt,{day:"numeric",month:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
        <ul>{preview.items.map(b=><li key={b.id}><strong>{b.name}</strong>{b.participantKind==="companion"?" · doprovod":""} — {b.mode==="late"?`pozdní storno, poplatek ${b.feeCents/100} Kč${input.feePolicy==="waive"?" bude prominut":" k úhradě ve studiu"}`:"bez storno poplatku"}</li>)}</ul>
        <p>Uvolní se {preview.releasedPlaces===1?"jedno místo":"dvě místa"}. Celkem k úhradě: <strong>{preview.totalFeeCents/100} Kč</strong>.</p>
        <label className="admin-check"><input type="checkbox" checked={confirmed} disabled={working} onChange={e=>setConfirmed(e.target.checked)}/> Potvrzuji vybrané osoby a uvedený storno poplatek nebo jeho prominutí.</label>
        <button className="button button-small" type="button" disabled={working||!confirmed} onClick={()=>void apply()}>{working?"Ukládám…":"Potvrdit odhlášení"}</button>
      </div>}
      <button type="button" disabled={working} onClick={onClose}>Ponechat rezervaci</button>
    </>}
  </section>;
}

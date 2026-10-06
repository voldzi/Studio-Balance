"use client";

import { FormEvent, useState } from "react";
import { ApiError, apiRequest, formatStudioDate } from "../lib/api-types";
import { useAdminDraft } from "../lib/admin-draft";

export type ScheduleRule = {
  id: string; classTypeId: string; className: string; instructorId: string; instructorName: string;
  weekday: number; localStartTime: string; durationMinutes: number; capacity: number; priceCents: number;
  bookingLeadDays: number; active: boolean; generateFrom: string; generateUntil?: string | null;
};
type ClassOption = { id: string; name: string; active: boolean };
type Instructor = { id: string; displayName: string; active: boolean };
type Input = {
  ruleIds: string[]; from: string; through?: string; operation: "edit" | "close" | "cancel" | "open";
  classTypeId?: string; instructorId?: string; weekday?: number; localStartTime?: string;
  durationMinutes?: number; capacity?: number; priceCents?: number; bookingLeadDays?: number;
  reopenCancelled: boolean; updateBookedPrices: boolean; reason: string;
};
type Preview = {
  previewToken: string; rulesChanged: number; sessionsChanged: number; activeBookings: number; cancelledSessionsKept: number;
  exceptions: { id: string; startAt: string }[];
  slots: { from: string; through: string | null; before: {name:string;weekday:number;time:string;capacity:number;priceCents:number}; after: {name:string;weekday:number;time:string;capacity:number;priceCents:number} }[];
  terms: { id: string; startAt: string; newStartAt: string; status: string; bookings: number; before: string; after: string; capacity: number; priceCents: number; changed: boolean }[];
};
const days = ["", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
export const studioToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const isReplacementValid = (replacementId: string, rules: Pick<ScheduleRule, "classTypeId">[]) =>
  Boolean(replacementId) && rules.length > 0 && rules.every((r)=>r.classTypeId !== replacementId);

export function ScheduleChangeEditor({rule,rules,classTypes,instructors,busy,onApplied}: {
  rule: ScheduleRule; rules: ScheduleRule[]; classTypes: ClassOption[]; instructors: Instructor[]; busy: boolean; onApplied: () => Promise<void>;
}) {
  const [action,setAction] = useState("capacity");
  const [scope,setScope] = useState("slot");
  const [selectedClasses,setSelectedClasses] = useState([rule.classTypeId]);
  const [preview,setPreview] = useState<{input: Input; result: Preview} | null>(null);
  const [working,setWorking] = useState(false);
  const [message,setMessage] = useState("");
  const [expired,setExpired] = useState(false);
  const [newType,setNewType] = useState(false);
  const [replacementId,setReplacementId] = useState("");
  const [createdType,setCreatedType] = useState<ClassOption | null>(null);
  const draft = useAdminDraft(`schedule-${rule.id}`, (values) => {
    if (values.action) setAction(values.action);
    if (values.scope) setScope(values.scope);
    if (values.classTypeId) setReplacementId(values.classTypeId);
    const selected = Object.entries(values).filter(([name,value])=>name.startsWith("class:")&&value==="on").map(([name])=>name.slice(6));
    if(selected.length) setSelectedClasses(selected);
    setPreview(null);
  });
  const availableTypes = createdType ? [...classTypes,createdType] : classTypes;
  const chosenRules = scope === "slot" ? [rule] : rules.filter((r) => selectedClasses.includes(r.classTypeId));

  async function createType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); setWorking(true); setMessage("");
    const name = String(f.get("name")).trim(); const description = String(f.get("description")).trim();
    const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    try {
      const result = await apiRequest<{id:string}>("/api/v1/admin/class-types",{method:"POST",body:JSON.stringify({
        name,slug,tagline:description.slice(0,240),description,durationMinutes:60,arrivalLeadMinutes:10,active:true,
        sortOrder:classTypes.length*10+10,difficulty:2,benefits:"",audience:"",suitableForBeginners:true,
        defaultEquipment:"Pomůcky jsou připravené ve studiu.",whatToBring:"Sportovní oblečení, pohodlnou obuv a pití.",
        practicalNotice:"",heroImagePath:"",heroImageAlt:"",seoTitle:name,seoDescription:description.slice(0,320)
      })});
      setCreatedType({id:result.id,name,active:true});setReplacementId(result.id);setNewType(false);setPreview(null);
      setMessage(`Lekce ${name} je připravená. Nyní zkontrolujte náhradu termínů a potvrďte ji.`);
    } catch(e) { setMessage(e instanceof Error ? e.message : "Novou lekci se nepodařilo vytvořit."); }
    finally { setWorking(false); }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();const f=new FormData(event.currentTarget);setMessage("");setPreview(null);
    if (action === "replace" && !isReplacementValid(replacementId,chosenRules)) {
      setMessage("Vyberte jiný druh lekce. Text vysvětlení sám lekci nenahradí.");
      return;
    }
    setWorking(true);
    const from = String(f.get("from")); const through = String(f.get("through") ?? "");
    const input: Input = {ruleIds:chosenRules.map((r)=>r.id),from,...(through?{through}:{}),
      operation: ["close","cancel","open"].includes(action) ? action as Input["operation"] : "edit",
      reopenCancelled:f.get("reopenCancelled")==="on",updateBookedPrices:f.get("updateBookedPrices")==="on",
      reason:String(f.get("reason")).trim(),
      ...(["capacity","edit","replace"].includes(action)?{capacity:Number(f.get("capacity"))}:{}),
      ...(["price","edit","replace"].includes(action)?{priceCents:Math.round(Number(f.get("price"))*100)}:{}),
      ...(["edit","replace"].includes(action)?{instructorId:String(f.get("instructorId")),durationMinutes:Number(f.get("durationMinutes")),bookingLeadDays:Number(f.get("bookingLeadDays")),
        ...(scope==="slot"?{weekday:Number(f.get("weekday")),localStartTime:String(f.get("localStartTime"))}:{})}:{}),
      ...(action==="replace"?{classTypeId:String(f.get("classTypeId"))}:{})
    };
    try { const result=await apiRequest<Preview>("/api/v1/admin/schedule-changes/preview",{method:"POST",body:JSON.stringify(input)});setPreview({input,result});setExpired(false); }
    catch(e) { setExpired(e instanceof ApiError && e.status===401);setMessage(e instanceof Error?e.message:"Náhled se nepodařilo načíst."); }
    finally {setWorking(false);}
  }
  async function apply() {
    if(!preview) return;
    if(preview.input.operation==="cancel" && !window.confirm(`Zrušit ${preview.result.sessionsChanged} termínů a jejich aktivní rezervace bez poplatku?`)) return;
    if(preview.input.updateBookedPrices && !window.confirm("Změnit i cenu potvrzených rezervací? Nová cena se použije i jako základ případného budoucího storno poplatku.")) return;
    setWorking(true);setMessage("");
    try {
      await apiRequest("/api/v1/admin/schedule-changes/apply",{method:"POST",body:JSON.stringify({...preview.input,previewToken:preview.result.previewToken})});
      draft.clear();setPreview(null);setMessage("Změna byla uložena pro vybrané termíny i jejich automatické doplňování.");setExpired(false);await onApplied();
    } catch(e) {setExpired(e instanceof ApiError && e.status===401);setPreview(null);setMessage(e instanceof Error?e.message:"Změnu se nepodařilo uložit. Zkontrolujte dopad znovu.");}
    finally {setWorking(false);}
  }
  return <details className="admin-create"><summary>Upravit pravidelnou lekci</summary>
    <p className="admin-form-note">Vyberte změnu a její rozsah. Datum platí pro už vypsané termíny i pro automatické doplňování. Individuálně upravené termíny zůstanou jako výjimky.</p>
    <form className="admin-form admin-form-grid" ref={draft.ref} onInput={draft.save} onChange={()=>setPreview(null)} onSubmit={(e)=>void review(e)}>
      <label>Co změnit?<select name="action" value={action} onChange={(e)=>{setAction(e.target.value);setPreview(null);}}>
        <option value="capacity">Kapacitu</option><option value="price">Cenu</option><option value="edit">Čas, instruktora a další údaje</option>
        <option value="replace">Nahradit jinou lekcí</option><option value="close">Uzavřít nové rezervace</option><option value="cancel">Lekce se nekoná – zrušit i rezervace</option><option value="open">Obnovit rezervace a doplňování termínů</option>
      </select></label>
      <label>Které termíny?<select name="scope" value={scope} onChange={(e)=>{setScope(e.target.value);setPreview(null);}}><option value="slot">Jen {(days[rule.weekday] ?? "").toLowerCase()} v {rule.localStartTime}</option><option value="classes">Všechny pravidelné časy vybraných lekcí</option></select></label>
      {scope==="classes" && <fieldset className="admin-form-wide"><legend>Vyberte lekce</legend>{classTypes.filter((t)=>rules.some((r)=>r.classTypeId===t.id)).map((t)=><label className="admin-check" key={t.id}><input type="checkbox" name={`class:${t.id}`} checked={selectedClasses.includes(t.id)} onChange={(e)=>{setSelectedClasses(e.target.checked?[...selectedClasses,t.id]:selectedClasses.filter((id)=>id!==t.id));setPreview(null);}}/>{t.name}</label>)}</fieldset>}
      <label>Platí od<input name="from" type="date" min={studioToday()} defaultValue={studioToday()} required/></label>
      <label>Platí do (volitelné)<input name="through" type="date" min={studioToday()}/><small>Bez konce platí změna dále. Po konci se obnoví dosavadní pravidelný plán.</small></label>
      <p className="admin-form-note admin-form-wide">Vybráno: {chosenRules.map((r)=>`${r.className} – ${days[r.weekday]} ${r.localStartTime}`).join("; ") || "Vyberte alespoň jednu lekci."}</p>
      {action==="replace" && <p className="admin-form-note admin-form-wide">1. Vyberte náhradní lekci, nebo ji vytvořte tlačítkem níže. 2. Nastavte datum, kapacitu a cenu. 3. Zkontrolujte dopad a potvrďte změnu. Nově vytvořená lekce se vybere automaticky. Pro náhradu v pátek i v neděli zvolte všechny pravidelné časy.</p>}
      {action==="replace" && <label className="admin-form-wide">Nová lekce<select name="classTypeId" required value={replacementId} onChange={(e)=>setReplacementId(e.target.value)}><option value="">Vyberte náhradní lekci</option>{availableTypes.filter((t)=>t.active && !chosenRules.some((r)=>r.classTypeId===t.id)).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button type="button" onClick={()=>setNewType(!newType)}>+ Přidat nový druh lekce</button></label>}
      {["edit","replace"].includes(action) && <>
        {scope==="slot" && <><label>Den<select name="weekday" defaultValue={rule.weekday}>{days.slice(1).map((day,i)=><option key={day} value={i+1}>{day}</option>)}</select></label><label>Začátek<input name="localStartTime" defaultValue={rule.localStartTime} type="time" required/></label></>}
        <label>Instruktor<select name="instructorId" defaultValue={rule.instructorId}>{instructors.filter((i)=>i.active).map((i)=><option key={i.id} value={i.id}>{i.displayName}</option>)}</select></label>
        <label>Délka (min)<input name="durationMinutes" type="number" min={15} max={240} defaultValue={rule.durationMinutes} required/></label>
        <label>Rezervace otevřít dní předem<input name="bookingLeadDays" type="number" min={1} max={93} defaultValue={rule.bookingLeadDays} required/></label>
      </>}
      {["capacity","edit","replace"].includes(action) && <label>Nová kapacita<input name="capacity" type="number" min={1} max={500} defaultValue={rule.capacity} required/><small>Nesmí být nižší než počet přihlášených.</small></label>}
      {["price","edit","replace"].includes(action) && <><label>Nová cena (Kč)<input name="price" type="number" min={0} max={10000} step="0.01" defaultValue={rule.priceCents/100} required/></label><label className="admin-check admin-form-wide"><input name="updateBookedPrices" type="checkbox"/> Změnit cenu i již potvrzených rezervací. Ovlivní také jejich budoucí storno poplatek.</label></>}
      {action!=="cancel" && action!=="close" && <label className="admin-check admin-form-wide"><input name="reopenCancelled" type="checkbox"/> Otevřít také dříve zrušené termíny v tomto období. Zrušené rezervace zůstanou zrušené.</label>}
      <p className="admin-form-note admin-form-wide">{action==="cancel"?"Aktivní rezervace vybraných lekcí se zruší bez poplatku. Historie zůstane zachovaná.":action==="close"?"Lekce a potvrzené rezervace zůstanou. Nové rezervace nepůjdou vytvořit.":"Potvrzené rezervace zůstanou. Při změně času, instruktora nebo typu dostanou klienti oznámení a možnost bezplatně odmítnout změnu."}</p>
      <label className="admin-form-wide">Vysvětlení změny<textarea name="reason" minLength={3} maxLength={1000} rows={2} required placeholder="Např. Od 8. října bude ve čtvrtek Body Sculpt."/></label>
      <button className="button" type="submit" disabled={busy||working||chosenRules.length===0}>Zkontrolovat dopad</button>
    </form>
    {newType && <form className="admin-form" onSubmit={(e)=>void createType(e)}><h3>Nový druh lekce</h3><label>Název<input name="name" minLength={2} maxLength={120} required/></label><label>Popis<textarea name="description" minLength={2} maxLength={5000} required/></label><p className="admin-form-note">Fotografii a podrobné informace můžete doplnit v Lekce a lektoři.</p><button className="button" disabled={working} type="submit">Vytvořit lekci a pokračovat</button></form>}
    {preview && <section className="admin-data-card" role="status"><h3>Kontrola změny</h3><p>Od {preview.input.from}{preview.input.through?` do ${preview.input.through}`:" dále"}: {preview.result.rulesChanged} pravidelných časů, {preview.result.sessionsChanged} termínů, {preview.result.activeBookings} aktivních rezervací.</p>
      <ul>{preview.result.slots.map((slot,i)=><li key={i}>{slot.before.name} · {days[slot.before.weekday]} {slot.before.time} → {slot.after.name} · {days[slot.after.weekday]} {slot.after.time} · kapacita {slot.before.capacity} → {slot.after.capacity} · cena {slot.before.priceCents/100} → {slot.after.priceCents/100} Kč</li>)}</ul>
      {preview.result.cancelledSessionsKept>0&&<p>{preview.result.cancelledSessionsKept} zrušených termínů zůstane zrušených.</p>}
      <details><summary>Konkrétní termíny ({preview.result.terms.length})</summary><ul>{preview.result.terms.map((t)=><li key={t.id}>{formatStudioDate(t.startAt,{day:"numeric",month:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})} {t.newStartAt!==t.startAt?`→ ${formatStudioDate(t.newStartAt,{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})}`:""} · {t.before} → {t.after} · kapacita {t.capacity} · {t.priceCents/100} Kč · {t.bookings} rezervací{!t.changed?" · zůstane zrušeno":""}</li>)}</ul></details>
      {preview.result.exceptions.length>0&&<details open><summary>Individuální výjimky – nezmění se ({preview.result.exceptions.length})</summary><ul>{preview.result.exceptions.map((t)=><li key={t.id}>{formatStudioDate(t.startAt,{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})}</li>)}</ul></details>}
      <button className="button" type="button" disabled={busy||working} onClick={()=>void apply()}>Potvrdit změnu</button></section>}
    {expired&&<p role="alert">Přihlášení vypršelo. <a href="/admin/prihlaseni" target="_blank" rel="noopener noreferrer">Přihlaste se v nové kartě</a>, vraťte se a zkontrolujte dopad znovu. Rozepsané údaje zůstávají.</p>}
    {message&&<p className="admin-message" role="status">{message}</p>}
  </details>;
}

"use client";

import { FormEvent, useState } from "react";

type ClassType = { active: boolean; id: string; name: string };
const weekdays = [{ value: "1", label: "Pondělí" }, { value: "2", label: "Úterý" }, { value: "3", label: "Středa" }, { value: "4", label: "Čtvrtek" }, { value: "5", label: "Pátek" }, { value: "6", label: "Sobota" }, { value: "7", label: "Neděle" }];

export function ScheduleBatchForm({ busy, classTypes, onSubmit }: { busy: boolean; classTypes: ClassType[]; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const [action, setAction] = useState<"cancel" | "move">("cancel");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Prague" });
  return <form className="admin-form admin-form-grid" onSubmit={(event) => void onSubmit(event)}>
    <details className="admin-form-wide admin-guide">
      <summary>Rychlý návod</summary>
      <ol>
        <li><strong>Dočasně zastavit Barre:</strong> vyberte „Pozastavit vybranou lekci“, lekci Barre, dnešní datum a datum, od kterého se má znovu objevit. Do informace pro klientky napište například „Barre bude spuštěné od poloviny října.“</li>
        <li><strong>Přesunout Power Yogu:</strong> vyberte „Přesunout týdenní řadu“, zvolte původní den, nový den a čas. Období nastavte na všechny již vypsané termíny, které chcete změnit.</li>
        <li><strong>Po potvrzení:</strong> zkontrolujte seznam termínů níže. Klientky s rezervací dostanou zprávu; při pozastavení se jejich rezervace zruší bez poplatku.</li>
      </ol>
      <p>Viditelnou obecnou informaci pro návštěvnice upravíte nahoře na kartě „Otevření studia“ v poli „Informace v rozvrhu“.</p>
    </details>
    <label><span className="admin-label-row">Akce</span><select name="action" onChange={(event) => setAction(event.target.value as "cancel" | "move")} value={action}><option value="cancel">Pozastavit vybranou lekci</option><option value="move">Přesunout týdenní řadu</option></select></label>
    <label><span className="admin-label-row">Lekce</span><select name="classTypeId" required>{classTypes.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label><span className="admin-label-row">Od data</span><input defaultValue={today} min={today} name="from" required type="date" /></label>
    <label><span className="admin-label-row">Do data</span><input name="to" required type="date" /></label>
    {action === "move" && <><label><span className="admin-label-row">Původní den</span><select name="sourceWeekday">{weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label><label><span className="admin-label-row">Nový den</span><select name="targetWeekday">{weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label><label><span className="admin-label-row">Nový čas</span><input name="targetTime" required type="time" /></label></>}
    <label className="admin-form-wide"><span className="admin-label-row">Informace pro klientky</span><textarea name="reason" required rows={3} placeholder={action === "cancel" ? "Např. Barre bude spuštěné od poloviny října." : "Např. Power Yoga se nově koná v pátek."} /></label>
    <p className="admin-form-note admin-form-wide">Akce se týká jen naplánovaných termínů v období. U zrušení se aktivní rezervace zruší bez poplatku; při přesunu zůstanou zachované a klientky dostanou zprávu. Před potvrzením systém ověří kolizi studia i instruktora.</p>
    <div className="admin-row-actions"><button className="button" disabled={busy} type="submit">{action === "cancel" ? "Pozastavit termíny" : "Přesunout řadu"}</button></div>
  </form>;
}

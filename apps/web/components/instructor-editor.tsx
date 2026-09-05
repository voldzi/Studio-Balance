"use client";

import { type FormEvent, useEffect, useState } from "react";
import { apiRequest, type StudioImage, type TeamContent } from "../lib/api-types";
import { StudioPhoto } from "./studio-photo";

export type AdminInstructor = {
  id: string; displayName: string; bio: string; active: boolean; sortOrder: number;
  portraitAssetId: string | null; portrait: StudioImage | null;
  classes: { classTypeId: string; scheduleNote: string }[];
};
type AdminTeam = TeamContent & { photoAssetId: string | null; photoAlt: string; published: boolean };

async function upload(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("Vyberte fotografii do 8 MB.");
  return apiRequest<{ id: string }>("/api/v1/admin/media/studio-image", { method: "POST", headers: { "content-type": file.type }, body: file });
}

async function photoChange(data: FormData): Promise<string | null | undefined> {
  const file = data.get("photo");
  const remove = data.get("removePhoto") === "on";
  if (file instanceof File && file.size) {
    if (remove) throw new Error("Vyberte buď novou fotografii, nebo odebrání současné fotografie.");
    return (await upload(file)).id;
  }
  return remove ? null : undefined;
}

function PhotoFields({ photo }: { photo: StudioImage | null }) {
  return <><div className="admin-portrait-preview"><StudioPhoto image={photo} /></div>
    <label>Nová fotografie (JPG, PNG nebo WebP, do 8 MB)<input accept="image/jpeg,image/png,image/webp" name="photo" type="file" /></label>
    {photo && <label className="admin-check"><input name="removePhoto" type="checkbox" />Odebrat současnou fotografii</label>}</>;
}

export function InstructorEditor({ person, classTypes, onSaved }: {
  person: AdminInstructor; classTypes: { id: string; name: string }[]; onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setMessage("");
    try {
      const portraitAssetId = await photoChange(data);
      await apiRequest(`/api/v1/admin/instructors/${person.id}`, { method: "PATCH", body: JSON.stringify({
        displayName: data.get("displayName"), bio: data.get("bio"), active: person.active, sortOrder: person.sortOrder,
        ...(portraitAssetId !== undefined ? { portraitAssetId } : {}),
        classes: classTypes.filter((type) => data.get(`class-${type.id}`) === "on").map((type) => ({
          classTypeId: type.id, scheduleNote: String(data.get(`note-${type.id}`) ?? "")
        }))
      }) });
      await onSaved(); (form.elements.namedItem("photo") as HTMLInputElement).value = ""; setMessage("Profil instruktora byl uložen.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Profil se nepodařilo uložit."); }
    finally { setBusy(false); }
  }
  return <form className="admin-form instructor-editor" onSubmit={save}>
    <fieldset disabled={busy}><legend>Profil a fotografie</legend>
      <label>Veřejné jméno<input defaultValue={person.displayName} maxLength={160} minLength={2} name="displayName" required /></label>
      <label>Představení<textarea defaultValue={person.bio} maxLength={5000} name="bio" /></label>
      <PhotoFields photo={person.portrait} />
      <fieldset><legend>Lekce v katalogu</legend><p>Určuje představení lektorů u typu lekce. Konkrétní termín se řídí instruktorem v rozvrhu.</p>
        {classTypes.map((type) => { const assigned = person.classes.find((item) => item.classTypeId === type.id); return <div className="instructor-assignment" key={type.id}>
          <label className="admin-check"><input defaultChecked={Boolean(assigned)} name={`class-${type.id}`} type="checkbox" />{type.name}</label>
          <label>Upřesnění pro {type.name}<input defaultValue={assigned?.scheduleNote ?? ""} maxLength={160} name={`note-${type.id}`} placeholder="Např. Středa" /></label>
        </div>; })}
      </fieldset>
      <button className="button button-small" type="submit">{busy ? "Ukládáme…" : "Uložit profil"}</button>
    </fieldset>{message && <p role="status">{message}</p>}
  </form>;
}

export function TeamEditor() {
  const [team, setTeam] = useState<AdminTeam>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => apiRequest<AdminTeam>("/api/v1/admin/content/team").then(setTeam).catch(() => setMessage("Obsah týmu se nepodařilo načíst."));
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setMessage("");
    try {
      const photoAssetId = await photoChange(data);
      const result = await apiRequest<AdminTeam>("/api/v1/admin/content/team", { method: "PUT", body: JSON.stringify({
        title: data.get("title"), body: data.get("body"), photoAlt: data.get("photoAlt"), published: data.get("published") === "on",
        ...(photoAssetId !== undefined ? { photoAssetId } : {})
      }) });
      setTeam(result); (form.elements.namedItem("photo") as HTMLInputElement).value = ""; setMessage("Sekce Náš tým byla uložena.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sekci se nepodařilo uložit."); }
    finally { setBusy(false); }
  }
  if (!team) return <div><p role="status">{message || "Načítáme obsah týmu…"}</p>{message && <button type="button" onClick={() => void load()}>Zkusit znovu</button>}</div>;
  return <form className="admin-form team-editor" key={`${team.title}-${team.photo?.src}-${team.published}`} onSubmit={save}>
    <fieldset disabled={busy}><legend>Náš tým na stránce O studiu</legend>
      <label>Nadpis<input defaultValue={team.title} maxLength={160} minLength={2} name="title" required /></label>
      <label>Představení týmu<textarea defaultValue={team.body} maxLength={2000} minLength={10} name="body" required /></label>
      <PhotoFields photo={team.photo} />
      <label>Popis fotografie pro čtečky obrazovky<input defaultValue={team.photoAlt} maxLength={300} minLength={2} name="photoAlt" required /></label>
      <label className="admin-check"><input defaultChecked={team.published} name="published" type="checkbox" />Zobrazit na stránce O studiu</label>
      <button className="button button-small" type="submit">{busy ? "Ukládáme…" : "Uložit tým"}</button>
    </fieldset>{message && <p role="status">{message}</p>}
  </form>;
}

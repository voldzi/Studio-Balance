"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { ApiError, apiRequest } from "../lib/api-types";
import {
  moveWebsitePhoto, websitePhotoBytes, websitePhotoLimit, websitePhotoMime,
  type AdminWebsitePhotos, type WebsitePhotoInput
} from "../lib/studio-website-photos";
import { StudioPhoto } from "./studio-photo";

const endpoint = "/api/v1/admin/content/studio-photos";
type UploadError = { file: File; message: string; retry: boolean };
type UploadResult = { id: string; width: number; height: number };

export function StudioWebsitePhotosEditor({ active, onAuthRequired }: { active: boolean; onAuthRequired: () => void }) {
  const [draft, setDraft] = useState<AdminWebsitePhotos>();
  const [saved, setSaved] = useState<AdminWebsitePhotos>();
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);
  const operation = useRef(false);
  const dragging = useRef<{ source: string; pointer: number } | null>(null);
  const [dragOver, setDragOver] = useState<string>();
  const [dropping, setDropping] = useState(false);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [failures, setFailures] = useState<UploadError[]>([]);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const dirty = !!draft && draft !== saved;

  const load = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const current = await apiRequest<AdminWebsitePhotos>(endpoint);
      setDraft(current);
      setSaved(current);
      setFailures([]);
      setConflict(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthRequired();
      setError("Fotky se nepodařilo načíst. Zkuste to znovu.");
    } finally {
      operation.current = false;
      setLoading(false);
    }
  }, [onAuthRequired]);

  useEffect(() => {
    if (active && !loaded.current) {
      loaded.current = true;
      void load();
    }
  }, [active, load]);

  useEffect(() => {
    if (!dirty && !busy) return;
    function preventLoss(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = true; }
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty, busy]);

  async function upload(files: File[]) {
    if (!draft || loading || busy || operation.current || !files.length) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const rejected: UploadError[] = [];
    const slots = websitePhotoLimit - draft.entries.length;
    // A bounded queue uses one existing image-processing request at a time.
    const queue = files.slice(0, websitePhotoLimit);
    let added = 0;
    let authLost = false;
    try {
      for (const [index, file] of queue.entries()) {
        setProgress(`Zpracovávám fotku ${index + 1} z ${queue.length}…`);
        if (added >= slots) { rejected.push({ file, message: "Je dosažen limit počtu fotek.", retry: true }); continue; }
        if (!websitePhotoMime.includes(file.type) || file.size === 0 || file.size > websitePhotoBytes) {
          rejected.push({ file, message: "Vyberte platný JPG, PNG nebo WebP do 8 MB.", retry: false }); continue;
        }
        if (authLost) { rejected.push({ file, message: "Přihlaste se a zkuste znovu.", retry: true }); continue; }
        try {
          const photo = await apiRequest<UploadResult>("/api/v1/admin/media/studio-website-image", {
            method: "POST", headers: { "content-type": file.type }, body: file, signal: AbortSignal.timeout(45_000)
          });
          const alt = "";
          setDraft((state) => state && ({
            ...state, entries: [...state.entries, { assetId: photo.id, alt, visible: true,
              image: { src: `/api/v1/admin/media/${photo.id}`, width: photo.width, height: photo.height, alt } }]
          }));
          added++;
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) { authLost = true; onAuthRequired(); }
          rejected.push({ file, message: cause instanceof ApiError ? cause.message : "Nahrávání selhalo.", retry: true });
        }
      }
      setFailures((previous) => [...previous.filter(({file}) => !files.includes(file)), ...rejected].slice(0, websitePhotoLimit));
      if (added) setMessage(`Nahráno: ${added}. Na veřejném webu se změny objeví až po zveřejnění.`);
      if (files.length > queue.length) setError("Vybrat lze nejvýše 40 souborů najednou. Další soubory nebyly nahrány.");
    } finally {
      operation.current = false;
      setBusy(false);
      setProgress("");
    }
  }

  async function publish() {
    if (!draft || busy || conflict || operation.current) return;
    const payload: WebsitePhotoInput = {
      revision: draft.revision, homeId: draft.homeId, aboutId: draft.aboutId,
      entries: draft.entries.map(({ assetId, alt, visible }) => ({ assetId, alt: alt.trim(), visible }))
    };
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const current = await apiRequest<AdminWebsitePhotos>(endpoint, { method: "PUT", body: JSON.stringify(payload) });
      setDraft(current);
      setSaved(current);
      setMessage("Fotky byly zveřejněny. Web nyní zobrazuje uložený výběr.");
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 401) onAuthRequired();
        if (cause.status === 409) setConflict(true);
      }
      setError(cause instanceof Error ? cause.message : "Zveřejnění se nepodařilo.");
    } finally { operation.current = false; setBusy(false); }
  }

  const selected = (id: string | null | undefined) => draft?.entries.find((entry) => entry.assetId === id);
  const move = (source: string, target: string) => setDraft((state) => {
    if (!state) return state;
    const entries = moveWebsitePhoto(state.entries, source, target);
    return entries === state.entries ? state : { ...state, entries };
  });
  function dropFiles(event: DragEvent) {
    event.preventDefault();
    setDropping(false);
    void upload(Array.from(event.dataTransfer.files));
  }

  function targetAt(event: PointerEvent<HTMLElement>) {
    return document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(".website-photo-order > li")?.dataset.websiteAsset;
  }
  function finishMove(event: PointerEvent<HTMLElement>, cancelled = false) {
    const held = dragging.current;
    if (!held || held.pointer !== event.pointerId) return;
    const target = cancelled ? undefined : targetAt(event);
    if (target && !operation.current) move(held.source, target);
    dragging.current = null;
    setDragOver(undefined);
  }

  return <section aria-labelledby="studio-photos-title" className="website-photos-editor">
    <div className="admin-heading"><p className="eyebrow">Obsah webu</p><h1 id="studio-photos-title">Fotky studia</h1>
      <p>Nahrajte fotografie, vyberte úvod a O studiu, potom seřaďte galerii a zveřejněte ji.</p></div>
    {loading && <p role="status">Načítám fotky…</p>}
    {error && <p role="alert" className="admin-message">{error}</p>}
    {message && <p role="status" className="admin-message">{message}</p>}
    {!draft && !loading && <button type="button" onClick={() => void load()}>Načíst fotky</button>}
    {draft && <>
      {draft.revision === 0 && <p className="admin-message">Web zatím používá původní fotky. První zveřejnění nahradí původní galerii vaším výběrem. Bez výběru úvodní fotky nebo fotky pro O studiu na nich zůstane výchozí obrázek.</p>}
      <div className={`website-photo-drop${dropping ? " is-dragging" : ""}`}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDropping(true); } }}
        onDragLeave={() => setDropping(false)} onDrop={dropFiles}>
        <strong>Přetáhněte sem fotky z počítače</strong>
        <label>nebo vyberte soubory <input type="file" multiple accept={websitePhotoMime.join(",")} disabled={busy || loading || draft.entries.length >= websitePhotoLimit}
          onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void upload(files); }} /></label>
        <small>JPG, PNG nebo WebP, každá do 8 MB. Celkem {draft.entries.length} z {websitePhotoLimit} fotek.</small>
      </div>
      {progress && <p role="status">{progress}</p>}
      {failures.length > 0 && <div className="admin-message"><strong>Některé fotky se nenahrály</strong>
        <ul>{failures.map(({file, message: why}, index) => <li key={index}>{file.name}: {why}</li>)}</ul>
        {failures.some((failure) => failure.retry) && <button type="button" disabled={busy || loading || draft.entries.length >= websitePhotoLimit}
          onClick={() => void upload(failures.filter((failure) => failure.retry).map((failure) => failure.file))}>Zopakovat neúspěšné nahrání</button>}
        <button type="button" disabled={busy} onClick={() => setFailures([])}>Skrýt seznam chyb</button>
      </div>}
      <fieldset disabled={busy || loading} className="website-photo-placements">
        <legend>Hlavní fotografie</legend>
        {([{ key: "homeId", label: "Úvodní stránka" }, { key: "aboutId", label: "O studiu" }] as const).map(({ key, label }) =>
          <label key={key}>{label}
            <select value={draft[key] ?? ""} onChange={(event) => { const value = event.currentTarget.value || null; setDraft((state) => state && ({ ...state, [key]: value })); }}>
              <option value="">Ponechat výchozí fotografii</option>
              {draft.entries.map((entry, index) => <option key={entry.assetId} value={entry.assetId}>{index + 1}. {entry.alt.trim() || "Fotografie bez popisu"}</option>)}
            </select>
          </label>
        )}
      </fieldset>
      <h2>Pořadí galerie</h2>
      <p>Přetáhněte fotku za úchyt nebo ji posuňte šipkami. Skrytí fotografie v galerii nemění její použití na úvodu nebo v O studiu.</p>
      {!draft.entries.length && <p>Zatím nemáte vlastní fotografie. Začněte nahráním první fotky.</p>}
      <ol className="website-photo-order">
        {draft.entries.map((entry, index) => <li key={entry.assetId} data-website-asset={entry.assetId}
          className={dragOver === entry.assetId ? "is-dragging" : undefined}>
          <div className="website-photo-thumb"><StudioPhoto image={{...entry.image, alt: ""}} /></div>
          <div className="website-photo-entry">
            <div className="website-photo-actions">
              <strong>Fotka {index + 1}</strong>
              <span className="website-photo-handle" aria-hidden="true" title="Přetáhnout fotku"
                onPointerDown={(event) => {
                  if (busy || loading || operation.current || !event.isPrimary || event.button !== 0) return;
                  event.preventDefault();
                  dragging.current = { source: entry.assetId, pointer: event.pointerId };
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragOver(entry.assetId);
                }}
                onPointerMove={(event) => { if (dragging.current?.pointer === event.pointerId) setDragOver(targetAt(event)); }}
                onPointerUp={(event) => finishMove(event)}
                onPointerCancel={(event) => finishMove(event, true)}
                onLostPointerCapture={(event) => finishMove(event, true)}>⠿</span>
              <button aria-label={`Posunout fotku ${index + 1} nahoru`} disabled={busy || loading || index === 0} type="button" onClick={() => move(entry.assetId, draft.entries[index - 1]!.assetId)}>↑</button>
              <button aria-label={`Posunout fotku ${index + 1} dolů`} disabled={busy || loading || index === draft.entries.length - 1} type="button" onClick={() => move(entry.assetId, draft.entries[index + 1]!.assetId)}>↓</button>
            </div>
            <label>Krátký popis fotografie<input disabled={busy || loading} value={entry.alt} maxLength={300} placeholder="Např. Sál se zrcadlem a barre tyčí" onChange={(event) => {
              const alt = event.currentTarget.value;
              setDraft((state) => state && ({ ...state, entries: state.entries.map((photo) => photo.assetId === entry.assetId ? { ...photo, alt } : photo) }));
            }} /></label>
            <div className="website-photo-actions">
              <label><input type="checkbox" disabled={busy || loading} checked={entry.visible} onChange={(event) => {
                const visible = event.currentTarget.checked;
                setDraft((state) => state && ({ ...state, entries: state.entries.map((photo) => photo.assetId === entry.assetId ? { ...photo, visible } : photo) }));
              }} /> Zobrazit v galerii</label>
              <button type="button" disabled={busy || loading} onClick={() => setDraft((state) => state && ({
                ...state, homeId: state.homeId === entry.assetId ? null : state.homeId, aboutId: state.aboutId === entry.assetId ? null : state.aboutId,
                entries: state.entries.filter((photo) => photo.assetId !== entry.assetId)
              }))}>Odebrat z výběru</button>
            </div>
          </div>
        </li>)}
      </ol>
      <details className="website-photo-preview" open>
        <summary>Náhled před zveřejněním</summary>
        <div className="website-photo-actions" aria-label="Šířka náhledu">
          <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Telefon</button>
          <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Počítač</button>
        </div>
        <div className={`website-photo-preview-frame ${device}`}>
          <p><strong>Úvodní stránka</strong></p>
          <div className="website-photo-cover home"><StudioPhoto image={selected(draft.homeId)?.image ?? { src:"/images/studio-balance/studio-hero.jpg", alt:"Výchozí úvodní fotografie", width:1180, height:620 }} />
            <div className="website-photo-cover-copy" aria-hidden="true">Najdi si svůj balanc.</div>
          </div>
          <p><strong>O studiu</strong></p>
          <div className="website-photo-cover"><StudioPhoto image={selected(draft.aboutId)?.image ?? { src:"/images/studio-balance/studio-gallery.jpeg", alt:"Výchozí fotografie O studiu", width:1180, height:620 }} /></div>
          <p><strong>Galerie</strong></p>
          <div className="website-photo-preview-gallery">{draft.entries.filter((entry) => entry.visible).map((entry) => <StudioPhoto key={entry.assetId} image={{ ...entry.image, alt: entry.alt }} />)}</div>
          {!draft.entries.some((entry) => entry.visible) && <p>Galerie bude bez fotografií.</p>}
        </div>
      </details>
      <div className="website-photo-publish">
        {dirty && draft.entries.some((entry) => Array.from(entry.alt.trim()).length < 2) && <p>Než fotky zveřejníte, doplňte ke každé krátký popis.</p>}
        <button className="button" type="button" disabled={!dirty || busy || loading || conflict || draft.entries.some((entry) => Array.from(entry.alt.trim()).length < 2)} onClick={() => void publish()}>Zveřejnit fotky</button>
        {dirty && !conflict && <button type="button" disabled={busy || loading} onClick={() => { if (window.confirm("Zahodit rozepsané změny fotek?")) { setDraft(saved); setError(""); setMessage(""); setFailures([]); } }}>Zahodit změny</button>}
        {conflict && <button type="button" disabled={busy || loading} onClick={() => { if (window.confirm("Načíst uložené fotky a zahodit tento neuložený výběr?")) void load(); }}>Načíst aktuální stav</button>}
      </div>
    </>}
  </section>;
}

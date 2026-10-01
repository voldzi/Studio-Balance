"use client";
import { useEffect, useRef } from "react";

// Form content only, scoped to this tab and signed-in administrator. Never store rosters or authentication data.
export function useAdminDraft(key: string, onRestore?: (values: Record<string,string>) => void) {
  const ref = useRef<HTMLFormElement>(null);
  const restored = useRef(onRestore);
  const recovered = useRef<Record<string,string> | null>(null);
  const filled = useRef(new Set<string>());
  useEffect(()=>{restored.current=onRestore;});
  const storageKey = () => `sb-admin-draft:${ref.current?.closest<HTMLElement>("[data-draft-owner]")?.dataset.draftOwner ?? "admin"}:${key}`;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey()); if (!raw) return;
      const draft = JSON.parse(raw) as { saved: number; values: Record<string,string> };
      if (Date.now()-draft.saved>8*3600000) { sessionStorage.removeItem(storageKey()); return; }
      recovered.current=draft.values;
      const form = ref.current; if (!form) return;
      for (const element of Array.from(form.elements)) {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
        const value=draft.values[element.name]; if(value===undefined) continue;
        if(element instanceof HTMLInputElement && element.type==="checkbox") element.checked=value==="on";
        else if(element.type!=="file") element.value=value;
        filled.current.add(element.name);
      }
      restored.current?.(draft.values);
    } catch { /* Storage may be disabled on private devices; the form remains usable. */ }
  },[key]);
  useEffect(()=>{
    const form=ref.current;if(!form)return;
    const listener=()=>{try{sessionStorage.removeItem(storageKey());}catch{/* optional */}recovered.current=null;};
    form.addEventListener("admin-saved",listener);
    for(const element of Array.from(form.elements)) {
      if(!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || filled.current.has(element.name))continue;
      const value=recovered.current?.[element.name];if(value===undefined)continue;
      if(element instanceof HTMLInputElement && element.type==="checkbox")element.checked=value==="on";
      else if(element.type!=="file")element.value=value;
      filled.current.add(element.name);
    }
    return ()=>form.removeEventListener("admin-saved",listener);
  });
  function save() {
    // Wait for controlled scope/action fields to render before serializing ordinary fields.
    setTimeout(() => {
      try {
        const form=ref.current;if(!form)return;
        const values: Record<string,string>={};
        for(const element of Array.from(form.elements)) {
          if(!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name || element.type==="file" || element.type==="password")continue;
          values[element.name]=element instanceof HTMLInputElement && element.type==="checkbox" ? element.checked?"on":"off":element.value;
        }
        sessionStorage.setItem(storageKey(),JSON.stringify({saved:Date.now(),values}));
      } catch { /* Best effort; no saving request is blocked by browser storage. */ }
    },0);
  }
  function clear() { recovered.current=null; try {sessionStorage.removeItem(storageKey());}catch{/* optional storage */} }
  return {ref,save,clear};
}

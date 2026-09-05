"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import {
  appInstalledEvent,
  clearInstallPrompt,
  currentInstallPrompt,
  installPromptAvailableEvent,
  type DeferredInstallPrompt
} from "../lib/pwa-install";

type Platform = "android" | "ios" | "other";

function installedAsApp() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function platformFromUserAgent(): Platform {
  const userAgent = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(userAgent)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "other";
}

/**
 * Browser vendors do not expose one common mobile install button. This makes
 * the supported action discoverable in the public mobile navigation instead
 * of pretending that an iPhone can install the app programmatically.
 */
export function PwaInstallMenuAction({ onOpen, onClose }: { onOpen?: () => void; onClose?: () => void }) {
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt>();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [available, setAvailable] = useState(true);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPlatform(platformFromUserAgent());
    setDeferredPrompt(currentInstallPrompt());
    setAvailable(!installedAsApp());

    const promptAvailable = () => setDeferredPrompt(currentInstallPrompt());
    const installed = () => {
      setOpen(false);
      setAvailable(false);
    };


    window.addEventListener(installPromptAvailableEvent, promptAvailable);
    window.addEventListener(appInstalledEvent, installed);
    return () => {
      window.removeEventListener(installPromptAvailableEvent, promptAvailable);
      window.removeEventListener(appInstalledEvent, installed);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    closeButtonRef.current?.focus();
    return () => { dialog?.close(); window.requestAnimationFrame(() => onCloseRef.current?.()); };
  }, [open]);

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    clearInstallPrompt();
    setDeferredPrompt(undefined);
    setInstalling(false);
    if (choice.outcome === "accepted") {
      setOpen(false);
      setAvailable(false);
    }
    } catch { clearInstallPrompt(); setDeferredPrompt(undefined); }
    finally { setInstalling(false); }
  }

  if (!available) return null;

  return (
    <>
      <button aria-haspopup="dialog" className="mobile-nav-install" onClick={() => { onOpen?.(); setOpen(true); }} type="button">
        Přidat aplikaci
      </button>
      {open && createPortal(
        <dialog onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled):not([tabindex='-1'])")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }} ref={dialogRef} onCancel={() => { setOpen(false); }} aria-labelledby="pwa-mobile-install-title" className="pwa-install-modal">
          <button tabIndex={-1} aria-label="Zavřít návod k instalaci" className="pwa-install-modal-backdrop" onClick={() => { setOpen(false); }} type="button" />
          <div className="pwa-install-modal-panel">
            <button className="pwa-install-modal-close" onClick={() => { setOpen(false); }} ref={closeButtonRef} type="button">Zavřít</button>
            <p className="client-view-eyebrow">Studio Balance v telefonu</p>
            <h2 id="pwa-mobile-install-title">Měj studio vždy po ruce</h2>
            {platform === "ios" ? (
              <ol>
                <li>Otevři Studio Balance v prohlížeči Safari.</li>
                <li>Klepni dole na ikonu <strong>Sdílet</strong> (čtverec se šipkou).</li>
                <li>Vyber <strong>Přidat na plochu</strong> a pak potvrď <strong>Přidat</strong>.</li>
              </ol>
            ) : platform === "android" && deferredPrompt ? (
              <>
                <p>Studio Balance se přidá na plochu telefonu jako samostatná aplikace.</p>
                <button className="button" disabled={installing} onClick={() => void install()} type="button">
                  {installing ? "Přidávám…" : "Přidat na plochu"}
                </button>
              </>
            ) : platform === "android" ? (
              <ol>
                <li>Otevři v prohlížeči menu pomocí tří teček.</li>
                <li>Zvol <strong>Nainstalovat aplikaci</strong> nebo <strong>Přidat na plochu</strong>.</li>
                <li>Instalaci potvrď.</li>
              </ol>
            ) : (
              <ol>
                <li>Otevři menu prohlížeče.</li>
                <li>Zvol <strong>Nainstalovat Studio Balance</strong> nebo <strong>Přidat na plochu</strong>.</li>
                <li>Instalaci potvrď.</li>
              </ol>
            )}
            {!(platform === "android" && deferredPrompt) && <p className="pwa-install-note">Tyto položky jsou v menu prohlížeče — nejde o další tlačítka této stránky.</p>}
          </div>
        </dialog>, document.body
      )}
    </>
  );
}

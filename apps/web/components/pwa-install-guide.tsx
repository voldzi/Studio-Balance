"use client";

import { useEffect, useState } from "react";

import {
  appInstalledEvent,
  clearInstallPrompt,
  currentInstallPrompt,
  installPromptAvailableEvent,
  type DeferredInstallPrompt
} from "../lib/pwa-install";

const dismissedKey = "studio-balance-pwa-install-dismissed";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PwaInstallGuide() {
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt>();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone() || window.localStorage.getItem(dismissedKey) === "true") return;

    const userAgent = window.navigator.userAgent;
    const nextPlatform: "android" | "ios" | "other" = /iPad|iPhone|iPod/.test(userAgent) ? "ios" : /Android/.test(userAgent) ? "android" : "other";
    setPlatform(nextPlatform);
    setDeferredPrompt(currentInstallPrompt());
    setVisible(true);

    const onBeforeInstallPrompt = () => setDeferredPrompt(currentInstallPrompt());
    const onAppInstalled = () => setVisible(false);

    window.addEventListener(installPromptAvailableEvent, onBeforeInstallPrompt);
    window.addEventListener(appInstalledEvent, onAppInstalled);
    return () => {
      window.removeEventListener(installPromptAvailableEvent, onBeforeInstallPrompt);
      window.removeEventListener(appInstalledEvent, onAppInstalled);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(dismissedKey, "true");
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setInstalling(false);
    clearInstallPrompt();
    setDeferredPrompt(undefined);
    if (choice.outcome === "accepted") setVisible(false);
  }

  if (!visible) return null;

  return (
    <section aria-labelledby="install-app-title" className="pwa-install-guide">
      <div>
        <p className="client-view-eyebrow">Studio Balance v telefonu</p>
        <h3 id="install-app-title">Měj studio vždy po ruce</h3>
        {platform === "ios" ? (
          <ol><li>Otevři tuto stránku v Safari.</li><li>Klepni na ikonu Sdílet v liště prohlížeče.</li><li>V nabídce zvol „Přidat na plochu“ a potvrď „Přidat“.</li></ol>
        ) : platform === "android" && deferredPrompt ? (
          <p>Přidej si Studio Balance na plochu telefonu. Rozvrh a rezervace pak otevřeš jedním klepnutím.</p>
        ) : platform === "android" ? (
          <ol><li>Otevři menu prohlížeče pomocí tří teček.</li><li>Zvol položku „Nainstalovat aplikaci“ nebo „Přidat na plochu“.</li><li>Instalaci potvrď.</li></ol>
        ) : (
          <ol><li>Klikni na instalační ikonu vpravo v adresním řádku.</li><li>Pokud ji nevidíš, otevři menu prohlížeče a zvol „Nainstalovat Studio Balance“.</li><li>Instalaci potvrď.</li></ol>
        )}
        {!deferredPrompt && <p className="pwa-install-note">Výše uvedené názvy jsou kroky v menu prohlížeče, ne tlačítka této stránky.</p>}
      </div>
      <div className="pwa-install-actions">
        {deferredPrompt && <button className="client-primary-action" disabled={installing} onClick={() => void install()} type="button">{installing ? "Přidávám…" : "Přidat na plochu"}</button>}
        <button className="pwa-dismiss" onClick={dismiss} type="button">Teď ne</button>
      </div>
    </section>
  );
}

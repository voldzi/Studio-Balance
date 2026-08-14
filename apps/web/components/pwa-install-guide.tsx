"use client";

import { useEffect, useState } from "react";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
    setPlatform(/iPad|iPhone|iPod/.test(userAgent) ? "ios" : /Android/.test(userAgent) ? "android" : "other");
    setVisible(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    const onAppInstalled = () => setVisible(false);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
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
    if (choice.outcome === "accepted") setVisible(false);
  }

  if (!visible) return null;

  return (
    <section aria-labelledby="install-app-title" className="pwa-install-guide">
      <div>
        <p className="client-view-eyebrow">Studio Balance v telefonu</p>
        <h3 id="install-app-title">Měj studio vždy po ruce</h3>
        {platform === "ios" ? (
          <p>V Safari klepni na <strong>Sdílet</strong>, vyber <strong>Přidat na plochu</strong> a potvrď <strong>Přidat</strong>.</p>
        ) : platform === "android" && deferredPrompt ? (
          <p>Přidej si Studio Balance na plochu telefonu. Rozvrh a rezervace pak otevřeš jedním klepnutím.</p>
        ) : platform === "android" ? (
          <p>V menu prohlížeče vyber <strong>Nainstalovat aplikaci</strong> nebo <strong>Přidat na plochu</strong>.</p>
        ) : (
          <p>V menu prohlížeče vyber možnost <strong>Přidat na plochu</strong> nebo <strong>Nainstalovat aplikaci</strong>.</p>
        )}
      </div>
      <div className="pwa-install-actions">
        {deferredPrompt && <button className="client-primary-action" disabled={installing} onClick={() => void install()} type="button">{installing ? "Přidávám…" : "Přidat na plochu"}</button>}
        <button className="pwa-dismiss" onClick={dismiss} type="button">Teď ne</button>
      </div>
    </section>
  );
}

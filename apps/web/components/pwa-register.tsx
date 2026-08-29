"use client";

import { useEffect } from "react";

import { appInstalledEvent, clearInstallPrompt, rememberInstallPrompt } from "../lib/pwa-install";

export function PwaRegister() {
  useEffect(() => {
    const installed = () => {
      clearInstallPrompt();
      window.dispatchEvent(new Event(appInstalledEvent));
    };
    window.addEventListener("beforeinstallprompt", rememberInstallPrompt);
    window.addEventListener("appinstalled", installed);

    const removeInstallListeners = () => {
      window.removeEventListener("beforeinstallprompt", rememberInstallPrompt);
      window.removeEventListener("appinstalled", installed);
    };

    if (!("serviceWorker" in navigator)) return removeInstallListeners;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      );
      if ("caches" in window) {
        void caches.keys().then((keys) =>
          Promise.all(keys.filter((key) => key.startsWith("studio-balance-")).map((key) => caches.delete(key)))
        );
      }
      return removeInstallListeners;
    }

    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // PWA enhancement must never prevent using the booking web.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      removeInstallListeners();
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { allowedPublicAnalyticsPath, analyticsPermitted, createPublicAnalyticsBridge, configurePublicAnalyticsRuntime, publicAnalyticsConfig, type PublicAnalyticsRuntime } from "../lib/public-analytics";

declare global {
  interface Window { vcodePublicAnalytics?: PublicAnalyticsRuntime; }
}
let runtimeLoading: Promise<void> | undefined;
function loadRuntime(): Promise<void> {
  if (window.vcodePublicAnalytics) return Promise.resolve();
  if (!runtimeLoading) runtimeLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = publicAnalyticsConfig.runtimePath;
    script.async = true;
    script.integrity = publicAnalyticsConfig.runtimeIntegrity;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); runtimeLoading = undefined; reject(new Error("Analytics unavailable")); };
    document.head.appendChild(script);
  });
  return runtimeLoading;
}

export function PublicAnalytics({ eligible }: { eligible: boolean }) {
  const pathname = usePathname();
  const bridge = useRef<ReturnType<typeof createPublicAnalyticsBridge> | null>(null);
  useEffect(() => {
    let disposed = false;
    const environment = () => ({
      eligible, online: navigator.onLine, doNotTrack: navigator.doNotTrack,
      globalPrivacyControl: (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
    });
    if (!publicAnalyticsConfig.enabled || !publicAnalyticsConfig.privacyNoticeApproved
      || !publicAnalyticsConfig.websiteId || window.location.origin !== publicAnalyticsConfig.allowedOrigin) return;
    if (!allowedPublicAnalyticsPath(pathname) || !analyticsPermitted(environment())) {
      bridge.current?.(pathname, environment());
      return;
    }
    void loadRuntime().then(() => {
      if (disposed || !analyticsPermitted(environment()) || !window.vcodePublicAnalytics) return;
      if (window.vcodePublicAnalytics.contractVersion !== publicAnalyticsConfig.runtimeVersion) return;
      if (!bridge.current) {
        bridge.current = configurePublicAnalyticsRuntime(window.vcodePublicAnalytics, publicAnalyticsConfig.websiteId!);
      }
      bridge.current?.(pathname, environment());
    }).catch(() => { /* Shared analytics failure does not affect booking. */ });
    return () => { disposed = true; };
  }, [pathname, eligible]);
  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { allowedPublicAnalyticsPath, analyticsPermitted, createPublicAnalyticsBridge, configurePublicAnalyticsRuntime, type PublicAnalyticsRuntime } from "../lib/public-analytics";

import { configurePublicAnalyticsV2Runtime, selectPublicAnalyticsPlan, type PublicAnalyticsClickName, type PublicAnalyticsV2Runtime } from "../lib/public-analytics-v2";

const plan = selectPublicAnalyticsPlan();
let clickDispatcher: ((name: PublicAnalyticsClickName) => void) | null = null;
export function trackPublicAnalyticsClick(name: PublicAnalyticsClickName) {
  if (plan.runtimeVersion !== "vcode-public-v2" || window.location.origin !== plan.allowedOrigin) return;
  clickDispatcher?.(name); // No early-event queue or deferred sends.
}

declare global {
  interface Window { vcodePublicAnalytics?: PublicAnalyticsRuntime | PublicAnalyticsV2Runtime; }
}
let runtimeLoading: Promise<void> | undefined;
function loadRuntime(): Promise<void> {
  if (window.vcodePublicAnalytics?.contractVersion === plan.runtimeVersion) return Promise.resolve();
  if (!runtimeLoading) runtimeLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = plan.runtimePath;
    script.async = true;
    script.integrity = plan.runtimeIntegrity;
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
  const v2Client = useRef<ReturnType<typeof configurePublicAnalyticsV2Runtime>>(null);
  useEffect(() => {
    let disposed = false;
    const environment = () => ({
      eligible, online: navigator.onLine, doNotTrack: navigator.doNotTrack,
      globalPrivacyControl: (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
    });
    if (!plan.enabled || !plan.privacyNoticeApproved
      || !plan.websiteId || window.location.origin !== plan.allowedOrigin) return;
    if (!allowedPublicAnalyticsPath(pathname) || !analyticsPermitted(environment())) {
      bridge.current?.(pathname, environment());
      return;
    }
    void loadRuntime().then(() => {
      if (disposed || !analyticsPermitted(environment()) || !window.vcodePublicAnalytics) return;
      const runtime = window.vcodePublicAnalytics;
      if (runtime.contractVersion !== plan.runtimeVersion) return;
      if (plan.runtimeVersion === "vcode-public-v2" && runtime.contractVersion === "vcode-public-v2") {
        if (!v2Client.current) v2Client.current = configurePublicAnalyticsV2Runtime(runtime, plan.websiteId!);
        bridge.current = v2Client.current?.pageview ?? null;
        clickDispatcher = (name)=>v2Client.current?.event(name, window.location.pathname, environment());
      } else if (runtime.contractVersion === "vcode-public-v1" && !bridge.current) {
        bridge.current = configurePublicAnalyticsRuntime(runtime, plan.websiteId!);
      }
      bridge.current?.(pathname, environment());
    }).catch(() => { /* Shared analytics failure does not affect booking. */ });
    return () => { disposed = true; clickDispatcher = null; };
  }, [pathname, eligible]);
  return null;
}

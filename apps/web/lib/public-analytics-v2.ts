import { analyticsPermitted, allowedPublicAnalyticsPath, createPublicAnalyticsBridge, publicAnalyticsConfig, type AnalyticsEnvironment } from "./public-analytics";

// Owner approved exact VCode 6dc4dd3 replacement and activation (a56b160).
// TikTok source addition approved by the owner on 2026-10-05; see ADR 0023.
// Portfolio links approved on 2026-10-09 (CD-070 / ADR 0028); shared portfolio-1 bytes.
export const publicAnalyticsV2Config = {
  enabled: true as boolean,
  privacyNoticeApproved: true as boolean,
  runtimeVersion: "vcode-public-v2",
  runtimePath: "/vcode-analytics-portfolio-v1.js",
  runtimeRevision: "portfolio-1",
  collectorPath: "/analytics/v2/events",
  runtimeIntegrity: "sha384-zkZSzDImQVzQLiRsYnPvb7exdTP5bDp+cGuBD0J+Tb40PGH8ffG+b4qQGqfrP6lf",
  captureSources: true,
  allowedEvents: ["outbound-click", "portfolio-vcode-click", "portfolio-moje-porce-click", "portfolio-mestem-hrou-click"]
} as const;
export type PublicAnalyticsClickName = typeof publicAnalyticsV2Config.allowedEvents[number];
export interface PublicAnalyticsV2Runtime {
  contractVersion: "vcode-public-v2";
  runtimeRevision: "portfolio-1";
  create(options: {
    websiteId: string; collectorPath: string; allowedPaths: readonly string[];
    captureSources: true; allowedEvents: readonly PublicAnalyticsClickName[];
    autoPageview: false; autoClick: false; captureTitle: false; captureReferrer: false;
    credentials: "omit"; offline: "discard";
  }): {pageview(path: string): void; event(name: PublicAnalyticsClickName, path: string): void};
}
export function selectPublicAnalyticsPlan(gates = publicAnalyticsV2Config) {
  return gates.enabled && gates.privacyNoticeApproved
    ? {...publicAnalyticsConfig, ...publicAnalyticsV2Config, enabled: true, privacyNoticeApproved: true}
    : publicAnalyticsConfig;
}
export function configurePublicAnalyticsV2Runtime(runtime: PublicAnalyticsV2Runtime, websiteId: string) {
  if (runtime.contractVersion !== "vcode-public-v2" || runtime.runtimeRevision !== publicAnalyticsV2Config.runtimeRevision
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId)) return null;
  const client = runtime.create({websiteId, collectorPath:publicAnalyticsV2Config.collectorPath,
    allowedPaths:publicAnalyticsConfig.allowedPaths, captureSources:true,
    allowedEvents:publicAnalyticsV2Config.allowedEvents, autoPageview:false, autoClick:false,
    captureTitle:false, captureReferrer:false, credentials:"omit", offline:"discard"});
  return {
    pageview:createPublicAnalyticsBridge((path)=>client.pageview(path)),
    event(name: string, pathname: string, environment: AnalyticsEnvironment) {
      const path=allowedPublicAnalyticsPath(pathname);
      if (!path || !analyticsPermitted(environment)
        || !(publicAnalyticsV2Config.allowedEvents as readonly string[]).includes(name)) return;
      try { client.event(name as PublicAnalyticsClickName, path); } catch { /* Never affect navigation. */ }
    }
  };
}

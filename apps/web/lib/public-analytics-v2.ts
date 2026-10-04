import { analyticsPermitted, allowedPublicAnalyticsPath, createPublicAnalyticsBridge, publicAnalyticsConfig, type AnalyticsEnvironment } from "./public-analytics";

// Owner approved exact VCode 6dc4dd3 replacement and activation (a56b160).
// Local release candidate only; production deployment waits for coordinator slot.
export const publicAnalyticsV2Config = {
  enabled: true as boolean,
  privacyNoticeApproved: true as boolean,
  runtimeVersion: "vcode-public-v2",
  runtimePath: "/analytics/v2/tracker.js",
  collectorPath: "/analytics/v2/events",
  runtimeIntegrity: "sha384-4mn0sN5UeFuzSjaXlbulwbJz7N38PPOovouC9Xp3OHD0r94YKgx8B2RAk/nK6mg0",
  captureSources: true,
  allowedEvents: ["outbound-click"]
} as const;
export type PublicAnalyticsClickName = "outbound-click";
export interface PublicAnalyticsV2Runtime {
  contractVersion: "vcode-public-v2";
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
  if (runtime.contractVersion !== "vcode-public-v2"
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

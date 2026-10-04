// Reviewed configuration only; runtime/collector are owned by VCode.
export const publicAnalyticsConfig = {
  enabled: true,
  privacyNoticeApproved: true,
  allowedOrigin: "https://studio-balance.cz",
  websiteId: "7d3e49ff-bbc0-4e56-8ecc-4a9d1965fd62" as string | null,
  runtimeVersion: "vcode-public-v1",
  runtimePath: "/analytics/v1/tracker.js",
  runtimeIntegrity: "sha384-lhej7Cxih2xEDtoPqh2B7mI4JilbkjF9HtVj+agiDEv8P6XAO98U6FJUCNpIVsMN",
  collectorPath: "/analytics/v1/events",
  allowedPaths: ["/", "/o-studiu", "/lekce", "/rozvrh", "/cenik", "/galerie", "/recenze", "/balance-flow"]
} as const;

export interface PublicAnalyticsRuntime {
  contractVersion: "vcode-public-v1";
  create(options: {
    websiteId: string; collectorPath: string; allowedPaths: readonly string[];
    allowedEvents: readonly []; autoPageview: false; autoClick: false;
    captureTitle: false; captureReferrer: false; credentials: "omit"; offline: "discard";
  }): { pageview(sanitizedPath: string): void };
}
export interface AnalyticsEnvironment {
  eligible: boolean; online: boolean; doNotTrack: string | null | undefined;
  globalPrivacyControl: boolean | undefined;
}
export function allowedPublicAnalyticsPath(pathname: string): string | null {
  // Exact allowlist: no query, fragment, dynamic ID, slug or arbitrary property.
  return (publicAnalyticsConfig.allowedPaths as readonly string[]).includes(pathname) ? pathname : null;
}
export function analyticsPermitted(environment: AnalyticsEnvironment): boolean {
  return environment.eligible && environment.online && environment.doNotTrack !== "1"
    && environment.doNotTrack !== "yes" && environment.globalPrivacyControl !== true;
}
export function createPublicAnalyticsBridge(pageview: (path: string) => void) {
  let previousRoute: string | null = null;
  return (pathname: string, environment: AnalyticsEnvironment) => {
    const path = allowedPublicAnalyticsPath(pathname);
    if (!path || !analyticsPermitted(environment)) {
      previousRoute = null;
      return;
    }
    if (previousRoute === path) return;
    // No retries or offline queue. Navigation into a new public route is a new view.
    previousRoute = path;
    try { pageview(path); } catch { /* Analytics must never affect the product. */ }
  };
}

export function configurePublicAnalyticsRuntime(runtime: PublicAnalyticsRuntime, websiteId: string) {
  if (runtime.contractVersion !== publicAnalyticsConfig.runtimeVersion
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId)) return null;
  const client = runtime.create({
    websiteId, collectorPath: publicAnalyticsConfig.collectorPath,
    allowedPaths: publicAnalyticsConfig.allowedPaths, allowedEvents: [], autoPageview: false,
    autoClick: false, captureTitle: false, captureReferrer: false, credentials: "omit", offline: "discard"
  });
  return createPublicAnalyticsBridge((path) => client.pageview(path));
}

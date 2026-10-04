import { describe, expect, it, vi } from "vitest";
import { allowedPublicAnalyticsPath, createPublicAnalyticsBridge, configurePublicAnalyticsRuntime, publicAnalyticsConfig, type PublicAnalyticsRuntime } from "./public-analytics";

const anonymous = { eligible: true, online: true, doNotTrack: null, globalPrivacyControl: false };
describe("public analytics privacy boundary", () => {
  it("ships disabled with owner review pending", () => {
    expect(publicAnalyticsConfig.enabled).toBe(false);
    expect(publicAnalyticsConfig.privacyNoticeApproved).toBe(false);
    expect(publicAnalyticsConfig.allowedOrigin).toBe("https://studio-balance.cz");
    expect(publicAnalyticsConfig.runtimePath).toBe("/analytics/v1/tracker.js");
    expect(publicAnalyticsConfig.collectorPath).toBe("/analytics/v1/events");
    expect(publicAnalyticsConfig.websiteId).toBe("7d3e49ff-bbc0-4e56-8ecc-4a9d1965fd62");
  });
  it.each(publicAnalyticsConfig.allowedPaths)("accepts only general public path %s", (path) => {
    expect(allowedPublicAnalyticsPath(path)).toBe(path);
  });
  it.each(["/admin", "/admin/prihlaseni", "/muj-ucet", "/prihlaseni", "/auth/login", "/rezervace/123", "/rozvrh/123", "/lekce/barre", "/kontakt", "/promeny", "/api/v1/bookings", "/?email=private", "/#private", "/%61dmin", "/galerie/"])("rejects %s", (path) => {
    const send = vi.fn();
    createPublicAnalyticsBridge(send)(path, anonymous);
    expect(send).not.toHaveBeenCalled();
  });
  it.each([{eligible:false}, {online:false}, {doNotTrack:"1"}, {doNotTrack:"yes"}, {globalPrivacyControl:true}])("does not send or replay suppressed visits %j", (override) => {
    const send = vi.fn(); const bridge = createPublicAnalyticsBridge(send);
    bridge("/lekce", {...anonymous, ...override});
    expect(send).not.toHaveBeenCalled();
    bridge("/cenik", anonymous);
    expect(send.mock.calls).toEqual([["/cenik"]]);
  });
  it("deduplicates rerenders, preserves SPA return visits and isolates private routes", () => {
    const send = vi.fn(); const bridge = createPublicAnalyticsBridge(send);
    for (const path of ["/", "/", "/lekce", "/lekce", "/muj-ucet", "/lekce"]) bridge(path, anonymous);
    expect(send.mock.calls).toEqual([["/"], ["/lekce"], ["/lekce"]]);
  });
  it("never propagates runtime failures or retries", () => {
    const send = vi.fn(() => { throw new Error("offline"); }); const bridge = createPublicAnalyticsBridge(send);
    expect(() => bridge("/", anonymous)).not.toThrow();
    bridge("/", anonymous); expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("shared runtime contract", () => {
  const websiteId = "00000000-0000-4000-8000-000000000000";
  it("passes every privacy flag explicitly and only sends the allowed path", () => {
    const pageview = vi.fn(); const create = vi.fn(() => ({pageview}));
    const bridge = configurePublicAnalyticsRuntime({contractVersion:"vcode-public-v1", create}, websiteId);
    expect(create).toHaveBeenCalledWith({websiteId, collectorPath:"/analytics/v1/events", allowedPaths:publicAnalyticsConfig.allowedPaths, allowedEvents:[], autoPageview:false, autoClick:false, captureTitle:false, captureReferrer:false, credentials:"omit", offline:"discard"});
    bridge?.("/", anonymous); bridge?.("/rezervace/123", anonymous);
    expect(pageview.mock.calls).toEqual([["/"]]);
  });
  it("rejects a different runtime or unpaired website without creating a client", () => {
    const create = vi.fn();
    expect(configurePublicAnalyticsRuntime({contractVersion:"unknown",create} as unknown as PublicAnalyticsRuntime, websiteId)).toBeNull();
    expect(configurePublicAnalyticsRuntime({contractVersion:"vcode-public-v1",create}, "")).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { publicAnalyticsConfig } from "./public-analytics";
import { configurePublicAnalyticsV2Runtime, publicAnalyticsV2Config, selectPublicAnalyticsPlan, type PublicAnalyticsV2Runtime } from "./public-analytics-v2";

const anonymous={eligible:true,online:true,doNotTrack:null,globalPrivacyControl:false};
const websiteId="00000000-0000-4000-8000-000000000000";
function setup() {
  const event=vi.fn(),pageview=vi.fn(),create=vi.fn(()=>({event,pageview}));
  const bridge=configurePublicAnalyticsV2Runtime({contractVersion:"vcode-public-v2",create},websiteId)!;
  return {bridge,create,event,pageview};
}
describe("approved v2 release retains v1 fallback",()=>{
  it("selects only the specifically approved v2 release",()=>{
    expect(publicAnalyticsV2Config.enabled).toBe(true);
    expect(publicAnalyticsV2Config.privacyNoticeApproved).toBe(true);
    expect(selectPublicAnalyticsPlan()).toMatchObject({runtimeVersion:"vcode-public-v2",captureSources:true,allowedEvents:["outbound-click"]});
    expect(publicAnalyticsConfig).toMatchObject({enabled:true,privacyNoticeApproved:true,runtimeVersion:"vcode-public-v1",runtimePath:"/analytics/v1/tracker.js",collectorPath:"/analytics/v1/events"});
  });
  it.each([[true,false],[false,true],[false,false]])("one incomplete gate %s/%s still selects v1",(enabled,privacyNoticeApproved)=>{
    expect(selectPublicAnalyticsPlan({...publicAnalyticsV2Config,enabled,privacyNoticeApproved})).toBe(publicAnalyticsConfig);
  });
  it("requires both gates and retains the exact original paths and website",()=>{
    const plan=selectPublicAnalyticsPlan({...publicAnalyticsV2Config,enabled:true,privacyNoticeApproved:true});
    expect(plan).toMatchObject({runtimeVersion:"vcode-public-v2",collectorPath:"/analytics/v2/events",captureSources:true,allowedEvents:["outbound-click"]});
    expect(plan.allowedPaths).toBe(publicAnalyticsConfig.allowedPaths);
    expect(plan.websiteId).toBe(publicAnalyticsConfig.websiteId);
  });
});
describe("explicit v2 event privacy boundary",()=>{
  it("passes source capture and only existing outbound events, without raw source inputs",()=>{
    const {create}=setup();
    expect(create).toHaveBeenCalledWith({websiteId,collectorPath:"/analytics/v2/events",allowedPaths:publicAnalyticsConfig.allowedPaths,captureSources:true,allowedEvents:["outbound-click"],autoPageview:false,autoClick:false,captureTitle:false,captureReferrer:false,credentials:"omit",offline:"discard"});
  });
  it("sends only name and canonical current page, once per explicit click",()=>{
    const {bridge,event}=setup();bridge.event("outbound-click","/",anonymous);
    bridge.event("outbound-click","/",anonymous);
    expect(event.mock.calls).toEqual([["outbound-click","/"],["outbound-click","/"]]);
  });
  it.each(["contact-click","app-store-click","pageview","unknown","https://private.invalid/?email=private"])("rejects unpaired or arbitrary event %s",name=>{
    const {bridge,event}=setup();bridge.event(name,"/",anonymous);expect(event).not.toHaveBeenCalled();
  });
  it.each(["/admin","/admin/prihlaseni","/muj-ucet","/kontakt","/lekce/barre","/rozvrh/123","/?email=private","/#private","https://private.invalid"])("discards events on nonpublic path %s",path=>{
    const {bridge,event}=setup();bridge.event("outbound-click",path,anonymous);expect(event).not.toHaveBeenCalled();
  });
  it.each([{eligible:false},{online:false},{doNotTrack:"1"},{doNotTrack:"yes"},{globalPrivacyControl:true}])("discards suppressed clicks and never replays %j",override=>{
    const {bridge,event}=setup();bridge.event("outbound-click","/",{...anonymous,...override});
    expect(event).not.toHaveBeenCalled();bridge.pageview("/cenik",anonymous);
    expect(event).not.toHaveBeenCalled();
  });
  it("keeps SPA deduplication separate from explicit clicks",()=>{
    const {bridge,pageview,event}=setup();
    for(const path of ["/","/","/lekce","/muj-ucet","/lekce"])bridge.pageview(path,anonymous);
    expect(pageview.mock.calls).toEqual([["/"],["/lekce"],["/lekce"]]);expect(event).not.toHaveBeenCalled();
  });
  it("invalid runtime or website never initializes source capture",()=>{
    const create=vi.fn();
    expect(configurePublicAnalyticsV2Runtime({contractVersion:"vcode-public-v1",create} as unknown as PublicAnalyticsV2Runtime,websiteId)).toBeNull();
    expect(configurePublicAnalyticsV2Runtime({contractVersion:"vcode-public-v2",create},"invalid")).toBeNull();expect(create).not.toHaveBeenCalled();
  });
  it("analytics failure never prevents the outbound link action or retries",()=>{
    const event=vi.fn(()=>{throw new Error("Unavailable");});
    const bridge=configurePublicAnalyticsV2Runtime({contractVersion:"vcode-public-v2",create:()=>({event,pageview:vi.fn()})},websiteId)!;
    expect(()=>bridge.event("outbound-click","/",anonymous)).not.toThrow();expect(event).toHaveBeenCalledTimes(1);
  });
});

import { publicAnalyticsNotice } from "./public-analytics-notice";
import { publicAnalyticsNoticeV2 } from "./public-analytics-notice-v2";

describe("exact approved scope and paragraph replacement",()=>{
  it("keeps the eight public paths unchanged",()=>{
    expect(publicAnalyticsConfig.allowedPaths).toEqual(["/","/o-studiu","/lekce","/rozvrh","/cenik","/galerie","/recenze","/balance-flow"]);
  });
  it.each(["cs","en"] as const)("preserves introduction and remaining paragraphs for %s",lang=>{
    expect(publicAnalyticsNoticeV2[lang]).toHaveLength(4);
    for(const index of [0,2,3])expect(publicAnalyticsNoticeV2[lang][index]).toBe(publicAnalyticsNotice[lang][index]);
    expect(publicAnalyticsNoticeV2[lang][1]).not.toBe(publicAnalyticsNotice[lang][1]);
  });
});

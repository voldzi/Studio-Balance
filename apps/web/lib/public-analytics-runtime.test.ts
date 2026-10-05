import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {runInNewContext} from "node:vm";
import {describe,expect,it} from "vitest";
import {configurePublicAnalyticsV2Runtime,publicAnalyticsV2Config,type PublicAnalyticsV2Runtime} from "./public-analytics-v2";

const source=readFileSync(new URL("../public/vcode-analytics-tiktok.js",import.meta.url),"utf8");
const anonymous={eligible:true,online:true,doNotTrack:null as string|null,globalPrivacyControl:false};
function setup(referrer:string,environment={...anonymous}){
  const requests:Array<{path:string;options:Record<string,unknown>;input:Record<string,unknown>}>=[];
  const scope={window:{} as {vcodePublicAnalytics:PublicAnalyticsV2Runtime},document:{referrer},navigator:{onLine:environment.online,doNotTrack:environment.doNotTrack,globalPrivacyControl:environment.globalPrivacyControl},URL,fetch:(path:string,options:Record<string,unknown>)=>{requests.push({path,options,input:JSON.parse(options.body as string)});return Promise.resolve({ok:true});}};
  runInNewContext(source,scope);
  const bridge=configurePublicAnalyticsV2Runtime(scope.window.vcodePublicAnalytics,"00000000-0000-4000-8000-000000000000")!;
  return {requests,bridge,scope,environment};
}
describe("byte-pinned shared TikTok runtime",()=>{
  it("pins the published shared asset and exact approved SHA384",()=>{
    expect(publicAnalyticsV2Config.runtimePath).toBe("/vcode-analytics-tiktok.js");
    expect("sha384-"+createHash("sha384").update(source).digest("base64")).toBe(publicAnalyticsV2Config.runtimeIntegrity);
    expect(publicAnalyticsV2Config.runtimeIntegrity).toBe("sha384-JpAOJexapVVtAZAFpz3dwp4AHY8PLbao7cLk7Mg7VFIDy2g0/bOUl0zb/HO1qbX5");
  });
  it.each(["https://tiktok.com/@private/video/123?secret=test#private","https://www.tiktok.com/@private","https://vm.tiktok.com/secret","https://TIKTOK.COM/private"])("reduces %s to service label only",referrer=>{
    const {bridge,requests,environment}=setup(referrer);bridge.pageview("/",environment);
    expect(requests[0]!.input).toEqual({website:"00000000-0000-4000-8000-000000000000",name:"pageview",path:"/",source:"tiktok"});
    expect(requests[0]!.options).toMatchObject({credentials:"omit",referrerPolicy:"no-referrer"});
    expect(JSON.stringify(requests)).not.toContain("private");
  });
  it.each(["https://tiktok.com.evil.test/private","https://eviltiktok.com/private","https://tiktok-com.test/private","https://private.home.cz/","invalid"])("rejects lookalike or private source %s",referrer=>{
    const {bridge,requests,environment}=setup(referrer);bridge.pageview("/",environment);expect(requests[0]!.input).not.toHaveProperty("source");
  });
  it("preserves prior sources and event endpoint",()=>{
    const {bridge,requests,environment}=setup("https://google.com/search?q=private");
    bridge.pageview("/",environment);bridge.event("outbound-click","/",environment);
    expect(requests.map(r=>r.path)).toEqual(["/analytics/v2/events","/analytics/v2/events"]);
    expect(requests[0]!.input.source).toBe("google");expect(requests[1]!.input).toEqual({website:"00000000-0000-4000-8000-000000000000",name:"outbound-click",path:"/"});
  });
  it.each([{eligible:false},{online:false},{doNotTrack:"1"},{doNotTrack:"yes"},{globalPrivacyControl:true}])("collects nothing for excluded %j and never replays",override=>{
    const {bridge,requests,environment,scope}=setup("https://tiktok.com/private",{...anonymous,...override});
    bridge.pageview("/",environment);bridge.event("outbound-click","/",environment);expect(requests).toHaveLength(0);
    Object.assign(scope.navigator,{onLine:true,doNotTrack:null,globalPrivacyControl:false});expect(requests).toHaveLength(0);
  });
  it("rejects private paths and unapproved events and deduplicates pageviews",()=>{
    const {bridge,requests,environment}=setup("https://tiktok.com/private");
    for(const path of ["/admin","/muj-ucet","/kontakt","/lekce/barre","/?secret=private"]) {bridge.pageview(path,environment);bridge.event("outbound-click",path,environment);}
    for(const name of ["contact-click","app-store-click","unknown"])bridge.event(name,"/",environment);
    expect(requests).toHaveLength(0);bridge.pageview("/",environment);bridge.pageview("/",environment);expect(requests).toHaveLength(1);
  });
});

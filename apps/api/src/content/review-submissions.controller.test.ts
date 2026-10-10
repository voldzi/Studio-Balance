import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminRoleGuard } from "../admin/admin-role.guard.js";
import { OpaqueSessionService } from "../auth/opaque-session.service.js";
import { opaqueSessionServiceTestDouble } from "../auth/session.test-support.js";
import { loadRuntimeConfig, RuntimeConfigService } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
import { AdminReviewSubmissionsController, ReviewSubmissionsController } from "./review-submissions.controller.js";
import { reviewChallenge } from "./review-submissions-security.js";
import { ReviewSubmissionsService } from "./review-submissions.service.js";

const config = loadRuntimeConfig({ APP_ENV:"test",SESSION_SECRET:"review-test-secret-that-is-long-enough",PUBLIC_APP_URL:"https://studio.example.test",LOG_LEVEL:"error" });
const id = "11111111-1111-4111-8111-111111111111";
const payload = () => ({ ...reviewChallenge(config.sessionSecret,Date.now()-3000),authorLabel:"Jana",body:"Skvělá lekce, ráda se vrátím.",rating:5,consent:true,website:"" });
const input = () => { const {token,consentVersion,authorLabel,body,rating,consent,website}=payload(); return {token,consentVersion,authorLabel,body,rating,consent,website}; };
const headers = { origin:"https://studio.example.test","content-type":"application/json" };
describe("public review submissions HTTP",()=>{
  let app: NestFastifyApplication | undefined;
  afterEach(async()=>{await app?.close();});
  async function setup(){
    const service={ submit:vi.fn(async()=>({status:"pending"})),list:vi.fn(async()=>({items:[],pendingCount:0})),decide:vi.fn(async()=>({id,status:"approved",reviewId:id})) };
    const module=await Test.createTestingModule({controllers:[ReviewSubmissionsController,AdminReviewSubmissionsController],providers:[AdminRoleGuard,
      {provide:RuntimeConfigService,useValue:{value:config}},{provide:OpaqueSessionService,useValue:opaqueSessionServiceTestDouble},{provide:ReviewSubmissionsService,useValue:service}]}).compile();
    app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({logger:false}),{logger:false});
    configureHttp(app,config);await app.init();await app.getHttpAdapter().getInstance().ready();return {app,service};
  }
  async function cookie(roles=["admin"],mfa=true){const token=await new SignJWT({email:"operator@example.test",email_verified:true,roles,amr:mfa?["pwd","otp"]:["pwd"]})
    .setProtectedHeader({alg:"HS256"}).setSubject("admin-subject").setIssuer("studio-balance-web").setAudience("studio-balance-api").setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(config.sessionSecret));return `sb_admin_session=${token}`;}
  it("issues non-cached consent-bound challenge and accepts without login or public data echo",async()=>{
    const s=await setup();const challenge=await s.app.inject({method:"GET",url:"/api/v1/review-submissions/challenge"});
    expect(challenge.statusCode).toBe(200);expect(challenge.headers["cache-control"]).toBe("private, no-store");
    expect(Object.keys(challenge.json()).sort()).toEqual(["consentVersion","expiresAt","token"]);
    const response=await s.app.inject({method:"POST",url:"/api/v1/review-submissions",headers,payload:input()});
    expect(response.statusCode).toBe(202);expect(response.json()).toEqual({status:"pending"});expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(s.service.submit).toHaveBeenCalledWith({authorLabel:"Jana",body:"Skvělá lekce, ráda se vrátím.",rating:5,consentVersion:"reviews-public-v1-2026-10-10"},expect.any(String),expect.stringMatching(/^[a-f0-9]{64}$/));
  });
  it.each([undefined,"https://evil.example","null","https://studio.example.test.evil"])("rejects foreign/missing origin %s without service write",async(origin)=>{
    const s=await setup();const response=await s.app.inject({method:"POST",url:"/api/v1/review-submissions",headers:{"content-type":"application/json",...(origin?{origin}:{})},payload:input()});
    expect(response.statusCode).toBe(403);expect(response.json().error.code).toBe("ORIGIN_REJECTED");expect(response.headers["cache-control"]).toBe("private, no-store");expect(s.service.submit).not.toHaveBeenCalled();
  });
  it.each([{consent:false},{website:"spam"},{authorLabel:"x".repeat(81)},{body:"short"},{body:"👍👍👍👍👍"},{rating:0},{body:"Skrytý\u0000řídicí znak v textu"},{email:"private@example.test"}])("rejects invalid input %j",async(change)=>{
    const s=await setup();const response=await s.app.inject({method:"POST",url:"/api/v1/review-submissions",headers,payload:{...input(),...change}});
    expect(response.statusCode).toBe(400);expect(response.json().error.code).toBe("VALIDATION_ERROR");expect(s.service.submit).not.toHaveBeenCalled();
  });
  it("keeps distinct expired/too recent/consent errors and rejects text JSON",async()=>{
    const s=await setup();for(const [token,code] of [[reviewChallenge(config.sessionSecret).token,"REVIEW_CHALLENGE_TOO_RECENT"],[reviewChallenge(config.sessionSecret,Date.now()-1800000).token,"REVIEW_CHALLENGE_EXPIRED"]]){
      const response=await s.app.inject({method:"POST",url:"/api/v1/review-submissions",headers,payload:{...input(),token}});expect(response.statusCode).toBe(400);expect(response.json().error.code).toBe(code);
    }
    const unicode=await s.app.inject({method:"POST",url:"/api/v1/review-submissions",headers,payload:{...input(),authorLabel:"👍".repeat(80),body:"👍".repeat(10)}});
    expect(unicode.statusCode).toBe(202);expect(s.service.submit).toHaveBeenCalledOnce();s.service.submit.mockClear();
    const changed=await s.app.inject({method:"POST",url:"/api/v1/review-submissions",headers,payload:{...input(),consentVersion:"old"}});expect(changed.json().error.code).toBe("REVIEW_CONSENT_VERSION_CHANGED");
    const text=await s.app.inject({method:"POST",url:"/api/v1/review-submissions",headers:{...headers,"content-type":"text/plain"},payload:JSON.stringify(input())});expect(text.statusCode).toBe(400);expect(s.service.submit).not.toHaveBeenCalled();
  });
  it("requires administrator and MFA, validates status, rejection reason and returns decision200",async()=>{
    const s=await setup();for(const [auth,status] of [[undefined,401],[await cookie(["client"]),403],[await cookie(["admin"],false),403],[await cookie(),200]] as const){
      const response=await s.app.inject({method:"GET",url:"/api/v1/admin/content/review-submissions",headers:auth?{cookie:auth}:{}});expect(response.statusCode).toBe(status);expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    const invalid=await s.app.inject({method:"GET",url:"/api/v1/admin/content/review-submissions?status=anything",headers:{cookie:await cookie()}});expect(invalid.statusCode).toBe(400);
    const refused=await s.app.inject({method:"POST",url:`/api/v1/admin/content/review-submissions/${id}/decision`,headers:{...headers,cookie:await cookie()},payload:{decision:"reject",featured:false,reason:null}});expect(refused.statusCode).toBe(400);
    for (const origin of [undefined,"https://evil.example"]) {
      const denied=await s.app.inject({method:"POST",url:`/api/v1/admin/content/review-submissions/${id}/decision`,headers:{cookie:await cookie(),...(origin?{origin}:{})},payload:{decision:"approve",featured:true,reason:null}});
      expect(denied.statusCode).toBe(403);expect(denied.json().error.code).toBe("ORIGIN_REJECTED");expect(denied.headers["cache-control"]).toBe("private, no-store");
    }
    const approved=await s.app.inject({method:"POST",url:`/api/v1/admin/content/review-submissions/${id}/decision`,headers:{...headers,cookie:await cookie()},payload:{decision:"approve",featured:true,reason:null}});
    expect(approved.statusCode).toBe(200);expect(approved.headers["cache-control"]).toBe("private, no-store");expect(s.service.decide).toHaveBeenCalledOnce();
  });
});

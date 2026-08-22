import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminRoleGuard } from "../admin/admin-role.guard.js";
import { OpaqueSessionService } from "../auth/opaque-session.service.js";
import { opaqueSessionServiceTestDouble } from "../auth/session.test-support.js";
import { RuntimeConfigService, type RuntimeConfig } from "../config/runtime-config.js";
import { configureHttp } from "../http/configure-http.js";
import { AdminTransformationsController, TransformationsController } from "./transformations.controller.js";
import { TransformationsService } from "./transformations.service.js";

const config: RuntimeConfig = { apiPort:3001,databaseUrl:"postgresql://unused",environment:"test",logLevel:"error",oidc:{issuer:"http://localhost:8081/realms/studio-balance",webClientId:"web",webClientSecret:"web-secret",adminClientId:"admin",adminClientSecret:"admin-secret"},sessionSecret:"test-session-secret-that-is-long-enough-to-be-safe",version:"test" };
const imageA="11111111-1111-4111-8111-111111111111"; const imageB="22222222-2222-4222-8222-222222222222";

describe("transformations API",()=>{
  let app:NestFastifyApplication|undefined; afterEach(async()=>{await app?.close();});
  async function setup(){ const service={create:vi.fn(async()=>({id:imageA})),listAdmin:vi.fn(async()=>({items:[]})),listPublic:vi.fn(async()=>({items:[]})),update:vi.fn(async()=>({id:imageA}))}; const module=await Test.createTestingModule({controllers:[TransformationsController,AdminTransformationsController],providers:[AdminRoleGuard,{provide:OpaqueSessionService,useValue:opaqueSessionServiceTestDouble},{provide:RuntimeConfigService,useValue:{value:config}},{provide:TransformationsService,useValue:service}]}).compile(); const created=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({logger:false}),{logger:false}); configureHttp(created,config); await created.init(); await created.getHttpAdapter().getInstance().ready(); app=created; return {app:created,service}; }
  async function cookie(){ const token=await new SignJWT({email:"admin@example.test",email_verified:true,roles:["admin"],amr:["pwd","otp"]}).setProtectedHeader({alg:"HS256"}).setSubject("admin").setIssuer("studio-balance-web").setAudience("studio-balance-api").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(config.sessionSecret)); return `sb_admin_session=${token}`; }
  const payload={title:"Skutečná proměna",story:"Pravidelný pohyb mi přinesl více energie.",attribution:"Jana",beforeAssetId:imageA,afterAssetId:imageB,classTypeId:null,consentConfirmed:true,published:true,featured:true,sortOrder:10};

  it("lists public featured transformations without authentication",async()=>{const {app,service}=await setup();const response=await app.inject({method:"GET",url:"/api/v1/transformations?featured=true"});expect(response.statusCode).toBe(200);expect(service.listPublic).toHaveBeenCalledWith(true);});
  it("protects transformation drafts",async()=>{const {app}=await setup();expect((await app.inject({method:"GET",url:"/api/v1/admin/content/transformations"})).statusCode).toBe(401);expect((await app.inject({method:"GET",url:"/api/v1/admin/content/transformations",headers:{cookie:await cookie()}})).headers["cache-control"]).toBe("private, no-store");});
  it("requires consent before publication",async()=>{const {app,service}=await setup();const response=await app.inject({method:"POST",url:"/api/v1/admin/content/transformations",headers:{cookie:await cookie()},payload:{...payload,consentConfirmed:false}});expect(response.statusCode).toBe(400);expect(service.create).not.toHaveBeenCalled();});
  it("requires two different images",async()=>{const {app}=await setup();const response=await app.inject({method:"POST",url:"/api/v1/admin/content/transformations",headers:{cookie:await cookie()},payload:{...payload,afterAssetId:imageA}});expect(response.statusCode).toBe(400);});
  it("accepts a consented published transformation",async()=>{const {app,service}=await setup();const response=await app.inject({method:"POST",url:"/api/v1/admin/content/transformations",headers:{cookie:await cookie()},payload});expect(response.statusCode).toBe(201);expect(service.create).toHaveBeenCalledWith(payload,expect.any(Object));});
});

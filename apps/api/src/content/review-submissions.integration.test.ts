import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client, Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StudioSession } from "../auth/session.js";
import type { DatabaseService } from "../database/database.service.js";
import { REVIEW_CONSENT_VERSION } from "./review-submissions-security.js";
import { ReviewSubmissionsService } from "./review-submissions.service.js";
import { ReviewsService, type ReviewInput } from "./reviews.service.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);
const input = { authorLabel:"Jana K.",body:"Přátelské studio a příjemná lekce.",rating:1,consentVersion:REVIEW_CONSENT_VERSION };
const context: {requestId: string; session: StudioSession} = {requestId:"review_test",session:{subject:"synthetic-admin",email:"operator@example.test",emailVerified:true,mfaVerified:true,roles:["admin"]}};
const network = "a".repeat(64);
describe.skipIf(!databaseUrl)("public review transactions (isolated local PostgreSQL)",()=>{
  let setup:Client;let pool:Pool;let schema:string;let service:ReviewSubmissionsService;let reviews:ReviewsService;let failCommit=false;
  beforeEach(async()=>{
    if (!["localhost","127.0.0.1","[::1]"].includes(new URL(databaseUrl!).hostname)) throw new Error("Review integration tests require an isolated local database.");
    setup=new Client({connectionString:databaseUrl});await setup.connect();
    schema=`studio_reviews_${randomUUID().replaceAll("-","")}`;
    await setup.query(`CREATE SCHEMA "${schema}"`);await setup.query(`SET search_path TO "${schema}",public`);
    for(const name of ["0001_system.sql","0002_booking_core.sql","0005_reviews.sql","0032_public_review_submissions.sql"]) await setup.query(await readFile(new URL(name,migrations),"utf8"));
    pool=new Pool({connectionString:databaseUrl,max:4,application_name:schema,options:`-c search_path=${schema},public`});failCommit=false;
    const database={query:pool.query.bind(pool),transaction:async(work:Parameters<DatabaseService["transaction"]>[0])=>{
      const client=await pool.connect();await client.query("BEGIN");try{const result=await work(client);if(failCommit)throw new Error("Synthetic commit failure");await client.query("COMMIT");return result;}
      catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
    }} as unknown as DatabaseService;
    service=new ReviewSubmissionsService(database);reviews=new ReviewsService(database);
  });
  afterEach(async()=>{await pool?.end();if(setup){if(schema)await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await setup.end();}});
  async function contribution(nonce=randomUUID()) {await service.submit(input,nonce,network);return (await setup.query("SELECT * FROM review_submissions WHERE nonce=$1",[nonce])).rows[0];}
  async function count(table:string){return (await setup.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;}
  it("persists consent/originals without public publication and makes concurrent replay idempotent",async()=>{
    const nonce=randomUUID();await Promise.all(Array.from({length:12},()=>service.submit(input,nonce,network)));
    expect(await count("review_submissions")).toBe(1);expect(await count("review_submission_rate_events")).toBe(1);expect((await reviews.listPublic()).items).toEqual([]);
    const row=(await setup.query("SELECT * FROM review_submissions")).rows[0];expect(row).toMatchObject({author_label:input.authorLabel,body:input.body,rating:1,consent_version:REVIEW_CONSENT_VERSION,status:"pending",moderated_at:null,review_id:null});
    expect(row.consented_at).toEqual(row.created_at);
    await expect(service.submit({...input,body:"Změněný text druhého pokusu."},nonce,network)).rejects.toMatchObject({response:{code:"REVIEW_SUBMISSION_CONFLICT"}});
    expect(await count("review_submissions")).toBe(1);
  });
  it("enforces rolling network cap across concurrent distinct nonces and ignores browser resets",async()=>{
    await setup.query("INSERT INTO review_submission_rate_events (network_hash) SELECT $1 FROM generate_series(1,29)",[network]);
    const results=await Promise.allSettled([service.submit(input,randomUUID(),network),service.submit(input,randomUUID(),network)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);const rejected=results.find(r=>r.status==="rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({response:{code:"REVIEW_RATE_LIMITED"}});expect(await count("review_submissions")).toBe(1);expect(await count("review_submission_rate_events")).toBe(30);
  });
  it("atomically caps global accepts across different networks and bounds expiry cleanup",async()=>{
    await setup.query("INSERT INTO review_submission_rate_events (network_hash) SELECT md5(n::text)||md5(n::text) FROM generate_series(1,199) n");
    const results=await Promise.allSettled([service.submit(input,randomUUID(),network),service.submit(input,randomUUID(),"b".repeat(64))]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(await count("review_submission_rate_events")).toBe(200);
    await setup.query("UPDATE review_submission_rate_events SET created_at=now()-interval '3 hours',expires_at=now()-interval '1 hour'");
    await service.submit(input,randomUUID(),network);expect(await count("review_submission_rate_events")).toBe(1);
    const rate=(await setup.query("SELECT * FROM review_submission_rate_events")).rows[0];expect(rate.network_hash).toBe(network);expect(rate).not.toHaveProperty("ip");expect(rate).not.toHaveProperty("author_label");
  });
  it("publishes a low rating unchanged only after one atomic administrator decision and audit",async()=>{
    const row=await contribution();const results=await Promise.all(Array.from({length:10},()=>service.decide(row.id,{decision:"approve",featured:true,reason:null},context)));
    expect(new Set(results.map(r=>r.reviewId)).size).toBe(1);expect(await count("reviews")).toBe(1);expect(await count("application_audit")).toBe(1);
    expect((await reviews.listPublic(true)).items[0]).toMatchObject({authorLabel:input.authorLabel,body:input.body,rating:1,source:"Web studia"});
    expect((await reviews.listAdmin()).items[0]?.submittedByClient).toBe(true);
    const audit=(await setup.query("SELECT * FROM application_audit")).rows[0];expect(audit).toMatchObject({actor_id:context.session.subject,action:"review_submission.approved",entity_id:row.id,request_id:context.requestId,metadata:{}});
    await expect(service.decide(row.id,{decision:"reject",featured:false,reason:"Nevhodný obsah"},context)).rejects.toMatchObject({response:{code:"REVIEW_MODERATION_CONFLICT"}});
    await expect(service.decide(row.id,{decision:"approve",featured:false,reason:null},context)).rejects.toMatchObject({response:{code:"REVIEW_MODERATION_CONFLICT"}});
    expect(await count("reviews")).toBe(1);expect(await count("application_audit")).toBe(1);
  });
  it("keeps rejected contributions private and records a moderation reason without changing original",async()=>{
    const row=await contribution();await service.decide(row.id,{decision:"reject",featured:false,reason:"Obsahuje osobní údaje další osoby"},context);
    expect(await count("reviews")).toBe(0);const list=await service.list("rejected");expect(list.pendingCount).toBe(0);
    expect(list.items[0]).toMatchObject({authorLabel:input.authorLabel,body:input.body,rating:1,status:"rejected",reviewId:null,moderationReason:"Obsahuje osobní údaje další osoby"});
    await expect(setup.query("UPDATE review_submissions SET body='Přepsaný klientský názor' WHERE id=$1",[row.id])).rejects.toMatchObject({code:"23514"});
    await expect(setup.query("UPDATE review_submissions SET moderation_reason='Druhý důvod' WHERE id=$1",[row.id])).rejects.toMatchObject({code:"23514"});
  });
  it("protects submitted published name/text/rating in API and database but permits visibility controls",async()=>{
    const row=await contribution();const decision=await service.decide(row.id,{decision:"approve",featured:false,reason:null},context);
    const current=(await reviews.listAdmin()).items[0]!;const editable:ReviewInput={authorLabel:current.authorLabel,body:current.body,rating:current.rating,source:current.source,reviewedOn:current.reviewedOn,classTypeId:null,consentConfirmed:true,published:true,featured:false,sortOrder:100};
    await expect(reviews.update(decision.reviewId!,{...editable,body:"Změněná recenze bez souhlasu"},context)).rejects.toMatchObject({response:{code:"VALIDATION_ERROR"}});
    await expect(setup.query("UPDATE reviews SET rating=5 WHERE id=$1",[decision.reviewId])).rejects.toMatchObject({code:"23514"});
    await reviews.update(decision.reviewId!,{published:false,featured:true,sortOrder:10},context);expect((await reviews.listPublic()).items).toHaveLength(0);
    const legacy=(await reviews.create({...editable,authorLabel:"Předaná reference"},context)).id;
    await expect(reviews.update(legacy,{published:false,featured:true,sortOrder:10},context)).rejects.toMatchObject({response:{code:"VALIDATION_ERROR"}});
    await reviews.update(legacy,{...editable,authorLabel:"Opravená reference"},context);expect((await reviews.listAdmin()).items.find(r=>r.id===legacy)?.submittedByClient).toBe(false);
  });
  it("rolls back acceptance/rate and publication/moderation/audit together on transaction failure",async()=>{
    failCommit=true;await expect(service.submit(input,randomUUID(),network)).rejects.toMatchObject({response:{code:"SERVICE_UNAVAILABLE"},status:503});expect(await count("review_submissions")).toBe(0);expect(await count("review_submission_rate_events")).toBe(0);
    failCommit=false;const row=await contribution();failCommit=true;await expect(service.decide(row.id,{decision:"approve",featured:true,reason:null},context)).rejects.toMatchObject({response:{code:"SERVICE_UNAVAILABLE"},status:503});
    expect(await count("reviews")).toBe(0);expect(await count("application_audit")).toBe(0);expect((await service.list("pending")).pendingCount).toBe(1);
  });
  it("returns bounded oldest pending queue and excludes nonce/payload/network hashes",async()=>{
    await setup.query(`INSERT INTO review_submissions (nonce,payload_hash,author_label,body,rating,consent_version,consented_at,created_at)
      SELECT gen_random_uuid(),repeat('f',64),'Ukázková klientka','Příjemná pravidelná lekce',5,$1,now()-n*interval '1 minute',now()-n*interval '1 minute' FROM generate_series(1,110)n`,[REVIEW_CONSENT_VERSION]);
    const list=await service.list("pending");expect(list.pendingCount).toBe(110);expect(list.items).toHaveLength(100);
    expect(new Date(list.items[0]!.createdAt).getTime()).toBeLessThan(new Date(list.items[99]!.createdAt).getTime());
    expect(list.items[0]).not.toHaveProperty("nonce");expect(list.items[0]).not.toHaveProperty("payloadHash");expect(list.items[0]).not.toHaveProperty("networkHash");
  });
});

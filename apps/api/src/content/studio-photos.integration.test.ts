import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import multipart from "@fastify/multipart";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { SignJWT } from "jose";
import { Client, Pool, type PoolClient } from "pg";
import { expect, it } from "vitest";
import { AdminRoleGuard } from "../admin/admin-role.guard.js";
import { OpaqueSessionService } from "../auth/opaque-session.service.js";
import { opaqueSessionServiceTestDouble } from "../auth/session.test-support.js";
import { RuntimeConfigService, loadRuntimeConfig } from "../config/runtime-config.js";
import { DatabaseService } from "../database/database.service.js";
import { configureHttp } from "../http/configure-http.js";
import { AdminMediaController, MediaController } from "../media/media.controller.js";
import { MediaStorageService } from "../media/media-storage.service.js";
import { AdminStudioPhotosController, StudioPhotosController } from "./studio-photos.controller.js";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);
const adminPath = "/api/v1/admin/content/studio-photos";
const publicPath = "/api/v1/content/studio-photos";
const uploadPath = "/api/v1/admin/media/studio-website-image";

it.skipIf(!databaseUrl)("publishes ordered website photos atomically and protects draft/hidden media with real Postgres", async () => {
  const url = new URL(databaseUrl!);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Local database only");
  const schema = `studio_website_${randomUUID().replaceAll("-","")}`;
  const setup = new Client({ connectionString: databaseUrl });
  await setup.connect();
  let pool: Pool | undefined;
  let app: NestFastifyApplication | undefined;
  try {
    await setup.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setup.query(`SET search_path TO ${schema},public`);
    for (const name of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
      await setup.query(await readFile(new URL(name, migrations), "utf8"));
    }
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
    const transaction = async (work: (client: PoolClient) => Promise<unknown>) => {
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    };
    const secret = "local-test-secret-that-is-at-least-32-characters";
    const config = loadRuntimeConfig({ APP_ENV: "test", APP_VERSION: "test", SESSION_SECRET: secret, LOG_LEVEL: "error" });
    const objects = new Map<string, Buffer>();
    const module = await Test.createTestingModule({
      controllers: [StudioPhotosController, AdminStudioPhotosController, AdminMediaController, MediaController],
      providers: [AdminRoleGuard, { provide: RuntimeConfigService, useValue: { value: config } },
        { provide: OpaqueSessionService, useValue: opaqueSessionServiceTestDouble },
        { provide: DatabaseService, useValue: { query: pool.query.bind(pool), transaction } },
        { provide: MediaStorageService, useValue: {
          prepareImage: async (body: Buffer) => ({ body, width: 100, height: 50, contentType: "image/webp" }),
          put: async (key: string, data: Buffer) => { objects.set(key, data); },
          get: async (key: string) => objects.get(key)
        } }]
    }).compile();
    const adapter = new FastifyAdapter({logger:false});
    void adapter.getInstance().register(multipart);
    app = module.createNestApplication<NestFastifyApplication>(adapter, {logger:false});
    configureHttp(app, config);
    await app.init();
    await adapter.getInstance().ready();
    const cookie = async (roles: string[], amr: string[]) => {
      const token = await new SignJWT({ email:"operator@example.test", email_verified:true, roles, amr }).setProtectedHeader({alg:"HS256"})
        .setSubject("photo-admin").setIssuer("studio-balance-web").setAudience("studio-balance-api")
        .setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
      return {cookie:`sb_admin_session=${token}`};
    };
    const auth = await cookie(["admin"],["pwd","otp"]);
    const inject = app.inject.bind(app);
    expect((await inject({ method:"GET",url:adminPath })).statusCode).toBe(401);
    expect((await inject({ method:"POST",url:adminPath,headers:await cookie(["admin"],["pwd"]),payload:{} })).statusCode).toBe(403);
    expect((await inject({ method:"GET",url:publicPath })).json()).toEqual({ configured:false, home:null, about:null, gallery:[] });
    const uploadRequest = (body: Buffer, field = "file", headers = auth) => inject({
      method:"POST",url:uploadPath,headers:{...headers,"content-type":"multipart/form-data; boundary=studio-test"},
      payload:Buffer.concat([Buffer.from(`--studio-test\r\nContent-Disposition: form-data; name="${field}"; filename="photo.webp"\r\nContent-Type: image/webp\r\n\r\n`),
        body, Buffer.from("\r\n--studio-test--\r\n")])
    });
    expect((await uploadRequest(Buffer.from("webp"),"other")).statusCode).toBe(400);
    expect((await uploadRequest(Buffer.alloc(850*1024+1,1))).statusCode).toBe(413);
    expect((await uploadRequest(Buffer.alloc(850*1024,1))).statusCode).toBe(201);
    const upload = async () => {
      const response = await uploadRequest(Buffer.from("webp"));
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    };
    const [a,b,c] = [await upload(),await upload(),await upload()];
    expect((await inject({ method:"GET",url:`/api/v1/media/${a}` })).statusCode).toBe(404);
    expect((await inject({ method:"GET",url:`/api/v1/admin/media/${a}`,headers:auth })).statusCode).toBe(200);
    const put = (payload: object) => inject({ method:"POST", url:adminPath, headers:auth, payload });
    const entries = [{assetId:b,alt:"Druhý sál",visible:true},{assetId:a,alt:"První sál",visible:true},{assetId:c,alt:"Skrytá fotka",visible:false}];
    const wrong = randomUUID();
    await setup.query("INSERT INTO media_assets(id,storage_key,content_type,width,height,size_bytes,created_by) VALUES ($1,$2,'image/webp',100,50,4,'test')",[wrong,`studio/${wrong}.webp`]);
    expect((await put({revision:0,homeId:wrong,aboutId:null,entries:[{assetId:wrong,alt:"Portrét",visible:true}]})).statusCode).toBe(400);
    expect((await put({revision:0,homeId:a,aboutId:null,entries:[entries[0],entries[0]]})).statusCode).toBe(400);
    const payload = {revision:0,homeId:a,aboutId:b,entries};
    const outcomes = await Promise.all([put(payload),put({...payload,homeId:b})]);
    expect(outcomes.map((r) => r.statusCode).sort()).toEqual([200,409]);
    const live = await inject({method:"GET",url:publicPath});
    expect(live.headers["cache-control"]).toContain("no-store");
    expect(live.json().gallery.map((photo: {alt: string}) => photo.alt)).toEqual(["Druhý sál","První sál"]);
    expect(live.body).not.toContain(c);
    expect((await inject({method:"GET",url:`/api/v1/media/${c}`})).statusCode).toBe(404);
    expect((await inject({method:"GET",url:`/api/v1/media/${a}`})).statusCode).toBe(200);
    expect((await put({revision:1,homeId:c,aboutId:null,entries:entries.map((entry)=>({...entry,visible:false}))})).statusCode).toBe(200);
    expect((await inject({method:"GET",url:publicPath})).json()).toMatchObject({configured:true,home:{src:`/api/v1/media/${c}`},about:null,gallery:[]});
    expect((await inject({method:"GET",url:`/api/v1/media/${a}`})).statusCode).toBe(404);
    expect((await inject({method:"GET",url:`/api/v1/media/${c}`})).statusCode).toBe(200);
    expect((await setup.query("SELECT count(*)::int AS count FROM application_audit WHERE action='studio_photos.published'")).rows[0]?.count).toBe(2);
    const spec = JSON.parse(await readFile(new URL("../../../../openapi/openapi.json",import.meta.url),"utf8"));
    expect(Object.keys(live.json()).sort()).toEqual(spec.components.schemas.StudioPhotosPublic.required.sort());
    expect(spec.paths[uploadPath].post.security).toEqual([{adminSession:[]}]);
  } finally {
    await app?.close();
    await pool?.end();
    await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await setup.end();
  }
},30_000);

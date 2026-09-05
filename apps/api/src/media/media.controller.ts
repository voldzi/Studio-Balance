import { Body, Controller, Get, Header, HttpException, HttpStatus, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { DatabaseService } from "../database/database.service.js";
import { MediaStorageService } from "./media-storage.service.js";

const uuid = z.string().uuid();

@Controller("api/v1/admin/media")
@UseGuards(AdminRoleGuard)
export class AdminMediaController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(MediaStorageService) private readonly storage: MediaStorageService) {}

  @Post("transformation-image")
  async upload(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.saveImage(request, body, "transformations");
  }

  @Post("studio-image")
  async uploadStudioImage(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.saveImage(request, body, "studio");
  }

  private async saveImage(request: AdminRequest, body: unknown, namespace: "transformations" | "studio") {
    if (!Buffer.isBuffer(body)) throw invalidImage();
    const image = await this.storage.prepareImage(body);
    const id = randomUUID();
    const key = `${namespace}/${id}.webp`;
    await this.storage.put(key, image.body);
    try {
      await this.database.transaction(async (client) => {
        await client.query(`INSERT INTO media_assets (id,storage_key,content_type,width,height,size_bytes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, key, image.contentType, image.width, image.height, image.body.length, request.studioSession!.subject]);
        await client.query("INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id) VALUES ('admin',$1,'media.uploaded','media_asset',$2,$3)", [request.studioSession!.subject, id, request.id]);
      });
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }
    return { id, url: `/api/v1/media/${id}`, width: image.width, height: image.height };
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  async get(@Param("id") id: string, @Res({ passthrough: false }) reply: FastifyReply) {
    if (!uuid.safeParse(id).success) throw notFound();
    const result = await this.database.query<{ storage_key: string }>("SELECT storage_key FROM media_assets WHERE id=$1", [id]);
    const asset = result.rows[0];
    if (!asset) throw notFound();
    const body = await this.storage.get(asset.storage_key);
    return reply.header("Cache-Control", "private, no-store").type("image/webp").send(Buffer.from(body));
  }
}

@Controller("api/v1/media")
export class MediaController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(MediaStorageService) private readonly storage: MediaStorageService) {}

  @Get(":id")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async get(@Param("id") id: string, @Res({ passthrough: false }) reply: FastifyReply) {
    if (!uuid.safeParse(id).success) throw notFound();
    const result = await this.database.query<{ storage_key: string }>(`
      SELECT ma.storage_key FROM media_assets ma
      WHERE ma.id=$1 AND (EXISTS (
        SELECT 1 FROM client_transformations t
        WHERE t.published=true AND t.consent_confirmed=true
          AND (t.before_asset_id=ma.id OR t.after_asset_id=ma.id)
      ) OR EXISTS (
        SELECT 1 FROM instructors i WHERE i.active=true AND i.portrait_asset_id=ma.id
      ) OR EXISTS (
        SELECT 1 FROM studio_team t WHERE t.published=true AND t.photo_asset_id=ma.id
      ))
    `, [id]);
    const asset = result.rows[0];
    if (!asset) throw notFound();
    const body = await this.storage.get(asset.storage_key);
    return reply.type("image/webp").send(Buffer.from(body));
  }
}

function invalidImage() { return new HttpException({ code: "INVALID_IMAGE", message: "Nahrajte platnou fotografii JPG, PNG nebo WebP do 8 MB." }, HttpStatus.BAD_REQUEST); }
function notFound() { return new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Fotografie nebyla nalezena." }, HttpStatus.NOT_FOUND); }

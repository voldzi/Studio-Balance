import { Body, Controller, Get, HttpException, HttpStatus, Inject, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { DatabaseService } from "../database/database.service.js";
import { requireStudioAsset } from "../media/require-studio-asset.js";
import { teamPhotoSql, type StudioImage } from "../media/studio-image.js";

const schema = z.object({
  title: z.string().trim().min(2).max(160), body: z.string().trim().min(10).max(2000),
  photoAlt: z.string().trim().min(2).max(300), published: z.boolean(), photoAssetId: z.string().uuid().nullable().optional()
}).strict();
type TeamRow = { title: string; body: string; photo: StudioImage | null; photoAlt: string; photoAssetId: string | null; published: boolean };
const selectTeam = `SELECT t.title, t.body, t.photo_alt AS "photoAlt", t.photo_asset_id AS "photoAssetId",
  t.published, ${teamPhotoSql} AS photo FROM studio_team t`;

@Controller("api/v1/content/team")
export class TeamController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async get() {
    const result = await this.database.query<TeamRow>(`${selectTeam} WHERE t.published=true`);
    const row = result.rows[0];
    return { team: row ? { title: row.title, body: row.body, photo: row.photo } : null };
  }
}

@Controller("api/v1/admin/content/team")
@UseGuards(AdminRoleGuard)
export class AdminTeamController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async get() {
    const result = await this.database.query<TeamRow>(selectTeam);
    const row = result.rows[0]!;
    return { ...row, photo: row.photo && { ...row.photo, src: row.photo.src.replace("/api/v1/media/", "/api/v1/admin/media/") } };
  }

  @Put()
  async update(@Req() request: AdminRequest, @Body() body: unknown) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte název, text a popis fotografie týmu." }, HttpStatus.BAD_REQUEST);
    const data = parsed.data;
    await this.database.transaction(async (client) => {
      await requireStudioAsset(client, data.photoAssetId);
      await client.query(`UPDATE studio_team SET title=$1, body=$2, photo_alt=$3, published=$4,
        photo_asset_id=CASE WHEN $5 THEN $6::uuid ELSE photo_asset_id END,
        photo_preview_path=CASE WHEN $5 THEN '' ELSE photo_preview_path END, updated_at=now()`,
      [data.title, data.body, data.photoAlt, data.published, data.photoAssetId !== undefined, data.photoAssetId ?? null]);
      await client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id)
        VALUES ('admin',$1,'team.updated','studio_team','team',$2)`, [request.studioSession!.subject, request.id]);
    });
    return this.get();
  }
}

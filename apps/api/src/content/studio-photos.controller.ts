import { Body, Controller, Get, Header, HttpException, HttpStatus, Inject, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { DatabaseService } from "../database/database.service.js";
import type { StudioImage } from "../media/studio-image.js";

const id = z.uuid().transform((value) => value.toLowerCase());
const schema = z.strictObject({
  revision: z.int().min(0).max(2147483647),
  homeId: id.nullable(),
  aboutId: id.nullable(),
  entries: z.array(z.strictObject({ assetId: id, alt: z.string().trim().min(2).max(300), visible: z.boolean() })).max(40)
}).refine(({ entries, homeId, aboutId }) => {
  const ids = new Set(entries.map(({ assetId }) => assetId));
  return ids.size === entries.length && [homeId, aboutId].every((value) => value === null || ids.has(value));
});

type Entry = { assetId: string; alt: string; visible: boolean; image: StudioImage };
type Settings = { revision: number; homeId: string | null; aboutId: string | null; entries: Entry[] };
const snapshot = `SELECT s.revision, s.home_asset_id AS "homeId", s.about_asset_id AS "aboutId",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('assetId', p.asset_id, 'alt', p.alt, 'visible', p.visible,
      'image', jsonb_build_object('src', $1::text || p.asset_id::text, 'alt', p.alt,
        'width', m.width, 'height', m.height)) ORDER BY p.position)
    FROM studio_website_photos p JOIN media_assets m ON m.id=p.asset_id
  ), '[]'::jsonb) AS entries
  FROM studio_website_photo_settings s WHERE s.singleton`;

@Controller("api/v1/content/studio-photos")
export class StudioPhotosController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async get() {
    const { revision, homeId, aboutId, entries } = (await this.database.query<Settings>(snapshot, ["/api/v1/media/"])).rows[0]!;
    const selected = (assetId: string | null) => entries.find((entry) => entry.assetId === assetId)?.image ?? null;
    return { configured: revision > 0, home: selected(homeId), about: selected(aboutId), gallery: entries.filter((entry) => entry.visible).map((entry) => entry.image) };
  }
}

@Controller("api/v1/admin/content/studio-photos")
@UseGuards(AdminRoleGuard)
export class AdminStudioPhotosController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async get() {
    return (await this.database.query<Settings>(snapshot, ["/api/v1/admin/media/"])).rows[0]!;
  }

  @Put()
  @Header("Cache-Control", "private, no-store")
  async publish(@Req() request: AdminRequest, @Body() body: unknown) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw invalid();
    const { revision, homeId, aboutId, entries } = parsed.data;
    return this.database.transaction(async (client) => {
      const current = (await client.query<{ revision: number }>(
        "SELECT revision FROM studio_website_photo_settings WHERE singleton FOR UPDATE"
      )).rows[0]!;
      if (current.revision !== revision) throw new HttpException({
        code: "CONFLICT", message: "Fotky mezitím upravil někdo jiný. Načtěte aktuální stav, než změny znovu zveřejníte."
      }, HttpStatus.CONFLICT);
      const eligible = await client.query(
        "SELECT id FROM media_assets WHERE id=ANY($1::uuid[]) AND storage_key='studio-website/' || id::text || '.webp' FOR SHARE",
        [entries.map((entry) => entry.assetId)]
      );
      if (eligible.rowCount !== entries.length) throw invalid();
      await client.query("DELETE FROM studio_website_photos");
      await client.query(`INSERT INTO studio_website_photos (asset_id,alt,visible,position)
        SELECT u.asset_id,u.alt,u.visible,(u.ordinality-1)::int
        FROM unnest($1::uuid[],$2::text[],$3::boolean[]) WITH ORDINALITY AS u(asset_id,alt,visible,ordinality)`,
      [entries.map((e) => e.assetId), entries.map((e) => e.alt), entries.map((e) => e.visible)]);
      await client.query(`UPDATE studio_website_photo_settings SET revision=revision+1,
        home_asset_id=$1,about_asset_id=$2 WHERE singleton`, [homeId, aboutId]);
      await client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id)
        VALUES ('admin',$1,'studio_photos.published','studio_website_photos','website',$2)`,
      [request.studioSession!.subject, request.id]);
      return (await client.query<Settings>(snapshot, ["/api/v1/admin/media/"])).rows[0]!;
    });
  }
}

function invalid() {
  return new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte výběr a popisy fotek. Povolené jsou jen fotografie nahrané v sekci Fotky studia." }, HttpStatus.BAD_REQUEST);
}

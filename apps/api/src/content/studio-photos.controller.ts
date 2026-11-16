import { Body, Controller, Get, Header, HttpException, HttpStatus, Inject, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { homepageSections, websitePalettes } from "@studiobalance/domain";
import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { DatabaseService } from "../database/database.service.js";
import type { StudioImage } from "../media/studio-image.js";

const id = z.uuid().transform((value) => value.toLowerCase());
const appearanceSchema = z.strictObject({
  palette: z.enum(websitePalettes),
  sectionOrder: z.array(z.enum(homepageSections)).length(homepageSections.length)
    .refine((sections) => new Set(sections).size === homepageSections.length),
  logoId: id.nullable(),
  storyId: id.nullable(),
  flowId: id.nullable()
});

const schema = z.strictObject({
  revision: z.int().min(0).max(2147483647),
  homeId: id.nullable(),
  aboutId: id.nullable(),
  appearance: appearanceSchema.optional(),
  entries: z.array(z.strictObject({ assetId: id, alt: z.string().trim().min(2).max(300), visible: z.boolean() })).max(40)
}).refine(({ entries, homeId, aboutId, appearance }) => {
  const ids = new Set(entries.map(({ assetId }) => assetId));
  return ids.size === entries.length && [homeId, aboutId, appearance?.storyId ?? null, appearance?.flowId ?? null].every((value) => value === null || ids.has(value));
});

type Entry = { assetId: string; alt: string; visible: boolean; image: StudioImage };
type Appearance = z.infer<typeof appearanceSchema>;
type Settings = {
  revision: number; configured: boolean; homeId: string | null; aboutId: string | null;
  entries: Entry[]; appearance: Appearance; logo: StudioImage | null;
};
const snapshot = `SELECT s.revision, s.photos_configured AS configured, s.home_asset_id AS "homeId", s.about_asset_id AS "aboutId",
  jsonb_build_object('palette', s.palette, 'sectionOrder', s.section_order, 'logoId', s.logo_asset_id,
    'storyId', s.story_asset_id, 'flowId', s.flow_asset_id) AS appearance,
  CASE WHEN logo.id IS NOT NULL THEN jsonb_build_object('src', $1::text || logo.id::text,
    'alt', 'Studio Balance', 'width', logo.width, 'height', logo.height) END AS logo,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('assetId', p.asset_id, 'alt', p.alt, 'visible', p.visible,
      'image', jsonb_build_object('src', $1::text || p.asset_id::text, 'alt', p.alt,
        'width', m.width, 'height', m.height)) ORDER BY p.position)
    FROM studio_website_photos p JOIN media_assets m ON m.id=p.asset_id
  ), '[]'::jsonb) AS entries
  FROM studio_website_photo_settings s LEFT JOIN media_assets logo ON logo.id=s.logo_asset_id
  WHERE s.singleton`;

@Controller("api/v1/content/studio-photos")
export class StudioPhotosController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async get() {
    const { configured, homeId, aboutId, entries, appearance, logo } = (await this.database.query<Settings>(snapshot, ["/api/v1/media/"])).rows[0]!;
    const selected = (assetId: string | null) => entries.find((entry) => entry.assetId === assetId)?.image ?? null;
    return {
      configured, home: selected(homeId), about: selected(aboutId),
      gallery: entries.filter((entry) => entry.visible).map((entry) => entry.image),
      appearance: { palette: appearance.palette, sectionOrder: appearance.sectionOrder, logo,
        story: selected(appearance.storyId), flow: selected(appearance.flowId) }
    };
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

  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async publish(@Req() request: AdminRequest, @Body() body: unknown) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw invalid();
    const { revision, homeId, aboutId, entries, appearance } = parsed.data;
    return this.database.transaction(async (client) => {
      const current = (await client.query<{ revision: number }>(
        "SELECT revision FROM studio_website_photo_settings WHERE singleton FOR UPDATE"
      )).rows[0]!;
      if (current.revision !== revision) throw new HttpException({
        code: "CONFLICT", message: "Fotky mezitím upravil někdo jiný. Načtěte aktuální stav, než změny znovu zveřejníte."
      }, HttpStatus.CONFLICT);
      const previous = (await client.query<Settings>(snapshot, ["/api/v1/admin/media/"])).rows[0]!;
      // Earlier editors did not send appearance. Clear only placements whose photo they removed.
      const retained = new Set(entries.map((entry) => entry.assetId));
      const next = appearance ?? { ...previous.appearance,
        storyId: retained.has(previous.appearance.storyId ?? "") ? previous.appearance.storyId : null,
        flowId: retained.has(previous.appearance.flowId ?? "") ? previous.appearance.flowId : null
      };
      const assetIds = new Set(retained);
      if (next.logoId) assetIds.add(next.logoId);
      const eligible = await client.query(
        "SELECT id FROM media_assets WHERE id=ANY($1::uuid[]) AND storage_key='studio-website/' || id::text || '.webp' FOR SHARE",
        [[...assetIds]]
      );
      if (eligible.rowCount !== assetIds.size) throw invalid();
      await client.query("DELETE FROM studio_website_photos");
      await client.query(`INSERT INTO studio_website_photos (asset_id,alt,visible,position)
        SELECT u.asset_id,u.alt,u.visible,(u.ordinality-1)::int
        FROM unnest($1::uuid[],$2::text[],$3::boolean[]) WITH ORDINALITY AS u(asset_id,alt,visible,ordinality)`,
      [entries.map((e) => e.assetId), entries.map((e) => e.alt), entries.map((e) => e.visible)]);
      await client.query(`UPDATE studio_website_photo_settings SET revision=revision+1,
        home_asset_id=$1,about_asset_id=$2,photos_configured=photos_configured OR $3,
        palette=$4,section_order=$5,logo_asset_id=$6,story_asset_id=$7,flow_asset_id=$8 WHERE singleton`,
      [homeId, aboutId, !appearance || entries.length > 0, next.palette, next.sectionOrder, next.logoId, next.storyId, next.flowId]);
      await client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id)
        VALUES ('admin',$1,'studio_photos.published','studio_website_photos','website',$2)`,
      [request.studioSession!.subject, request.id]);
      return (await client.query<Settings>(snapshot, ["/api/v1/admin/media/"])).rows[0]!;
    });
  }
}

function invalid() {
  return new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte výběr a popisy fotek. Povolené jsou jen obrázky nahrané v sekci Vzhled webu." }, HttpStatus.BAD_REQUEST);
}

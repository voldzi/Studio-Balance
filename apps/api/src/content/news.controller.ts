import { Body, Controller, Get, Header, HttpException, HttpStatus, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { NewsService } from "./news.service.js";

const uuid = z.string().uuid();
const newsSchema = z.object({
  body: z.string().trim().min(10).max(5000),
  featured: z.boolean(),
  published: z.boolean(),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  sortOrder: z.number().int().min(0).max(10000),
  summary: z.string().trim().min(10).max(400),
  title: z.string().trim().min(2).max(160)
}).strict().refine((value) => !value.featured || value.published, { message: "Featured news must be published." })
  .refine((value) => !value.published || value.publishedAt !== null, { message: "Published news requires a date." });

@Controller("api/v1/news")
export class NewsController {
  constructor(@Inject(NewsService) private readonly news: NewsService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  list() { return this.news.listPublic(); }
}

@Controller("api/v1/admin/content/news")
@UseGuards(AdminRoleGuard)
export class AdminNewsController {
  constructor(@Inject(NewsService) private readonly news: NewsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list() { return this.news.listAdmin(); }

  @Post()
  create(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.news.create(parse(body), context(request));
  }

  @Patch(":id")
  async update(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!uuid.safeParse(id).success) throw notFound();
    const result = await this.news.update(id, parse(body), context(request));
    if (!result) throw notFound();
    return result;
  }
}

function parse(body: unknown) {
  const result = newsSchema.safeParse(body);
  if (!result.success) throw new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte zadané údaje novinky." }, HttpStatus.BAD_REQUEST);
  return result.data;
}

function context(request: AdminRequest) { return { requestId: request.id, session: request.studioSession! }; }
function notFound() { return new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Novinka nebyla nalezena." }, HttpStatus.NOT_FOUND); }

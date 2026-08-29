import { Body, Controller, Get, Header, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { InvalidTransformationReferenceError, TransformationsService } from "./transformations.service.js";

const uuid = z.string().uuid();
const schema = z.object({
  afterAssetId: uuid, attribution: z.string().trim().min(1).max(120), beforeAssetId: uuid,
  classTypeId: uuid.nullable(), consentConfirmed: z.boolean(), featured: z.boolean(), published: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000), story: z.string().trim().min(10).max(2000), title: z.string().trim().min(2).max(160)
}).strict()
  .refine((value) => value.beforeAssetId !== value.afterAssetId, { message: "Images must differ." })
  .refine((value) => !value.published || value.consentConfirmed, { message: "Publication requires consent." })
  .refine((value) => !value.featured || value.published, { message: "Featured items must be published." });

@Controller("api/v1/transformations")
export class TransformationsController {
  constructor(@Inject(TransformationsService) private readonly transformations: TransformationsService) {}
  @Get()
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  list(@Query("featured") featured?: string) {
    if (featured !== undefined && featured !== "true" && featured !== "false") throw validation();
    return this.transformations.listPublic(featured === "true");
  }
}

@Controller("api/v1/admin/content/transformations")
@UseGuards(AdminRoleGuard)
export class AdminTransformationsController {
  constructor(@Inject(TransformationsService) private readonly transformations: TransformationsService) {}
  @Get() @Header("Cache-Control", "private, no-store") list() { return this.transformations.listAdmin(); }
  @Post() async create(@Req() request: AdminRequest,@Body() body: unknown) {
    try { return await this.transformations.create(parse(body),context(request)); }
    catch (error) { if (error instanceof InvalidTransformationReferenceError) throw validation(); throw error; }
  }
  @Patch(":id") async update(@Req() request: AdminRequest,@Param("id") id: string,@Body() body: unknown) {
    if (!uuid.safeParse(id).success) throw notFound();
    try { const result = await this.transformations.update(id,parse(body),context(request)); if (!result) throw notFound(); return result; }
    catch (error) { if (error instanceof InvalidTransformationReferenceError) throw validation(); throw error; }
  }
}

function context(request: AdminRequest) { return { requestId: request.id,session: request.studioSession! }; }
function parse(body: unknown) { const result=schema.safeParse(body); if (!result.success) throw validation(); return result.data; }
function validation() { return new HttpException({ code:"VALIDATION_ERROR",message:"Zkontrolujte údaje proměny, dvě různé fotografie a doložený souhlas." },HttpStatus.BAD_REQUEST); }
function notFound() { return new HttpException({ code:"RESOURCE_NOT_FOUND",message:"Proměna nebyla nalezena." },HttpStatus.NOT_FOUND); }

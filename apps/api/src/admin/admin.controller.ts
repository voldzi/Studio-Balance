import { Body, Controller, Get, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AdminRoleGuard, type AdminRequest } from "./admin-role.guard.js";
import { AdminService } from "./admin.service.js";

const uuid = z.string().uuid();
const classTypeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().min(2).max(240), description: z.string().trim().min(2).max(5000),
  durationMinutes: z.number().int().min(15).max(240), arrivalLeadMinutes: z.number().int().min(0).max(120),
  active: z.boolean(), sortOrder: z.number().int().min(0).max(10000), difficulty: z.number().int().min(1).max(5),
  benefits: z.string().trim().max(3000), audience: z.string().trim().max(3000), suitableForBeginners: z.boolean(),
  defaultEquipment: z.string().trim().max(3000), whatToBring: z.string().trim().max(3000), practicalNotice: z.string().trim().max(3000),
  heroImagePath: z.string().trim().max(500).refine((value) => !value || value.startsWith("/images/studio-balance/"), "Invalid image path"),
  heroImageAlt: z.string().trim().max(500), seoTitle: z.string().trim().max(120), seoDescription: z.string().trim().max(320)
}).strict();
const instructorSchema = z.object({ displayName: z.string().trim().min(2).max(160), bio: z.string().trim().max(5000), active: z.boolean(), sortOrder: z.number().int().min(0).max(10000), portraitAssetId: uuid.nullable().optional(), classes: z.array(z.object({ classTypeId: uuid, scheduleNote: z.string().trim().max(160) }).strict()).max(50).refine((items) => new Set(items.map((item) => item.classTypeId)).size === items.length).optional() }).strict();
const sessionSchema = z.object({
  classTypeId: uuid, instructorId: uuid, startAt: z.iso.datetime({ offset: true }), durationMinutes: z.number().int().min(15).max(240),
  arrivalLeadMinutes: z.number().int().min(0).max(120), locationName: z.string().trim().min(2).max(160), locationAddress: z.string().trim().min(2).max(300),
  priceCents: z.number().int().min(0).max(1_000_000), capacity: z.number().int().min(1).max(500), equipment: z.string().trim().max(2000), suitability: z.string().trim().max(2000)
}).strict();

@Controller("api/v1/admin")
@UseGuards(AdminRoleGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("dashboard") dashboard() { return this.admin.dashboard(); }
  @Get("class-types") classTypes() { return this.admin.listClassTypes(); }
  @Post("class-types") createClassType(@Req() request: AdminRequest, @Body() body: unknown) { return this.admin.createClassType(parse(classTypeSchema, body), context(request)); }
  @Patch("class-types/:id") updateClassType(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) { return this.admin.updateClassType(parseId(id), parse(classTypeSchema, body), context(request)); }
  @Get("instructors") instructors() { return this.admin.listInstructors(); }
  @Post("instructors") createInstructor(@Req() request: AdminRequest, @Body() body: unknown) { return this.admin.createInstructor(parse(instructorSchema, body), context(request)); }
  @Patch("instructors/:id") updateInstructor(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) { return this.admin.updateInstructor(parseId(id), parse(instructorSchema, body), context(request)); }

  @Get("sessions") sessions(@Query("from") from?: string, @Query("to") to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const end = to ? new Date(to) : new Date(Date.now() + 93 * 86_400_000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 366 * 86_400_000) throw validation();
    return this.admin.listSessions(start, end);
  }
  @Post("sessions") createSession(@Req() request: AdminRequest, @Body() body: unknown) { return this.admin.createSession(parse(sessionSchema, body), context(request)); }
  @Patch("sessions/:id") updateSession(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) { return this.admin.updateSession(parseId(id), parse(sessionSchema, body), context(request)); }
  @Post("sessions/:id/cancel") cancelSession(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) {
    const data = parse(z.object({ reason: z.string().trim().min(3).max(1000) }).strict(), body);
    return this.admin.cancelSession(parseId(id), data.reason, context(request));
  }
  @Get("users") users(@Query("search") search?: string) { return this.admin.listUsers(search); }
  @Get("bookings") bookings(@Query("sessionId") sessionId?: string) { return this.admin.listBookings(sessionId ? parseId(sessionId) : undefined); }
  @Post("bookings/:id/attendance") attendance(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) {
    const data = parse(z.object({ status: z.enum(["attended", "no_show"]), reason: z.string().trim().min(3).max(1000) }).strict(), body);
    return this.admin.attendance(parseId(id), data.status, data.reason, context(request));
  }
}

function context(request: AdminRequest) { return { requestId: request.id, session: request.studioSession! }; }
function parseId(value: string) { if (!uuid.safeParse(value).success) throw new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Záznam nebyl nalezen." }, HttpStatus.NOT_FOUND); return value; }
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw validation(); return result.data; }
function validation() { return new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte zadané údaje." }, HttpStatus.BAD_REQUEST); }

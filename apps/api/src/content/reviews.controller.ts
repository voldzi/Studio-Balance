import { Body, Controller, Get, Header, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { InvalidReviewClassTypeError, ReviewsService } from "./reviews.service.js";

const uuid = z.string().uuid();
const reviewSchema = z.object({
  authorLabel: z.string().trim().min(1).max(120),
  body: z.string().trim().min(10).max(2000),
  classTypeId: uuid.nullable(),
  consentConfirmed: z.boolean(),
  featured: z.boolean(),
  published: z.boolean(),
  rating: z.number().int().min(1).max(5).nullable(),
  reviewedOn: z.iso.date().nullable(),
  sortOrder: z.number().int().min(0).max(10000),
  source: z.string().trim().min(2).max(200).nullish().transform((value) => value ?? null)
}).strict().refine((value) => !value.published || value.consentConfirmed, {
  message: "Published reviews require confirmed consent."
});

@Controller("api/v1/reviews")
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  list(@Query("featured") featured?: string) {
    if (featured !== undefined && featured !== "true" && featured !== "false") throw validation();
    return this.reviews.listPublic(featured === "true");
  }
}

@Controller("api/v1/admin/content/reviews")
@UseGuards(AdminRoleGuard)
export class AdminReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list() {
    return this.reviews.listAdmin();
  }

  @Post()
  async create(@Req() request: AdminRequest, @Body() body: unknown) {
    try {
      return await this.reviews.create(parse(body), context(request));
    } catch (error) {
      if (error instanceof InvalidReviewClassTypeError) throw validation();
      throw error;
    }
  }

  @Patch(":id")
  async update(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!uuid.safeParse(id).success) throw notFound();
    try {
      const result = await this.reviews.update(id, parse(body), context(request));
      if (!result) throw notFound();
      return result;
    } catch (error) {
      if (error instanceof InvalidReviewClassTypeError) throw validation();
      throw error;
    }
  }
}

function context(request: AdminRequest) {
  return { requestId: request.id, session: request.studioSession! };
}

function parse(body: unknown) {
  const result = reviewSchema.safeParse(body);
  if (!result.success) throw validation();
  return result.data;
}

function validation() {
  return new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte zadané údaje recenze." }, HttpStatus.BAD_REQUEST);
}

function notFound() {
  return new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Recenze nebyla nalezena." }, HttpStatus.NOT_FOUND);
}

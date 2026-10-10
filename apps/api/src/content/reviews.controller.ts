import { Body, Controller, Get, Header, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { InvalidReviewClassTypeError, ReviewsService } from "./reviews.service.js";

const uuid = z.string().uuid();
const visibilitySchema = z.object({ published: z.boolean(), featured: z.boolean(), sortOrder: z.number().int().min(0).max(10000) }).strict();
const reviewSchema = z.object({
  authorLabel: z.string().trim().max(240).refine((value) => validTextLength(value,1,120)),
  body: z.string().trim().max(4000).refine((value) => validTextLength(value,10,2000)),
  classTypeId: uuid.nullable(),
  consentConfirmed: z.boolean(),
  featured: z.boolean(),
  published: z.boolean(),
  rating: z.number().int().min(1).max(5).nullable(),
  reviewedOn: z.iso.date().nullable(),
  sortOrder: z.number().int().min(0).max(10000),
  source: z.string().trim().max(400).refine((value) => validTextLength(value,2,200)).nullish().transform((value) => value ?? null)
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
      const result = await this.reviews.update(id, parseUpdate(body), context(request));
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

function parseUpdate(body: unknown) {
  const visibility = visibilitySchema.safeParse(body);
  return visibility.success ? visibility.data : parse(body);
}

function validation() {
  return new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte zadané údaje recenze." }, HttpStatus.BAD_REQUEST);
}

function notFound() {
  return new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Recenze nebyla nalezena." }, HttpStatus.NOT_FOUND);
}

function validTextLength(value: string, minimum: number, maximum: number) {
  const length = [...value].length;
  return length >= minimum && length <= maximum && !value.includes("\u0000");
}

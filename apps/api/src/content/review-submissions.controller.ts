import { Body, Controller, Get, Header, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AdminRoleGuard, type AdminRequest } from "../admin/admin-role.guard.js";
import { RuntimeConfigService } from "../config/runtime-config.js";
import { REVIEW_CONSENT_VERSION, reviewChallenge, reviewNetworkHash, validateReviewChallenge } from "./review-submissions-security.js";
import { ReviewSubmissionsService } from "./review-submissions.service.js";

const submissionSchema = z.object({
  authorLabel: z.string().trim().max(160).refine((value) => validTextLength(value,1,80)), body: z.string().trim().max(4000).refine((value) => validTextLength(value,10,2000)),
  rating: z.number().int().min(1).max(5).nullable(), consent: z.literal(true),
  consentVersion: z.string().min(1).max(100), token: z.string().min(1).max(1000), website: z.literal("")
}).strict();
const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]), featured: z.boolean(), reason: z.string().trim().max(1000).refine((value) => validTextLength(value,3,500)).nullable()
}).strict().refine((value) => value.decision !== "reject" || value.reason !== null);

@Controller("api/v1/review-submissions")
export class ReviewSubmissionsController {
  constructor(@Inject(ReviewSubmissionsService) private readonly submissions: ReviewSubmissionsService,
    @Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}

  @Get("challenge")
  @Header("Cache-Control", "private, no-store")
  challenge() { return reviewChallenge(this.config.value.sessionSecret); }

  @Post()
  @HttpCode(202)
  @Header("Cache-Control", "private, no-store")
  async submit(@Req() request: FastifyRequest, @Body() body: unknown) {
    requireSameOriginJson(request, this.config);
    const parsed = submissionSchema.safeParse(body);
    if (!parsed.success) throw validation();
    if (parsed.data.consentVersion !== REVIEW_CONSENT_VERSION) throw new HttpException({ code: "REVIEW_CONSENT_VERSION_CHANGED", message: "Podmínky zveřejnění se změnily. Obnovte formulář a potvrďte aktuální souhlas." }, HttpStatus.BAD_REQUEST);
    const challenge = validateReviewChallenge(parsed.data.token, this.config.value.sessionSecret);
    if (challenge.status === "too_recent") throw new HttpException({ code: "REVIEW_CHALLENGE_TOO_RECENT", message: "Počkejte prosím chvíli a odešlete recenzi znovu." }, HttpStatus.BAD_REQUEST);
    if (challenge.status === "consent_changed") throw new HttpException({ code: "REVIEW_CONSENT_VERSION_CHANGED", message: "Podmínky zveřejnění se změnily. Obnovte formulář a potvrďte aktuální souhlas." }, HttpStatus.BAD_REQUEST);
    if (challenge.status !== "valid") throw new HttpException({ code: "REVIEW_CHALLENGE_EXPIRED", message: "Formulář vypršel nebo nebyl připraven. Obnovte jej a odešlete recenzi znovu." }, HttpStatus.BAD_REQUEST);
    const { authorLabel, body: text, rating, consentVersion } = parsed.data;
    return this.submissions.submit({ authorLabel, body: text, rating, consentVersion }, challenge.payload.nonce, reviewNetworkHash(request, this.config.value));
  }
}

@Controller("api/v1/admin/content/review-submissions")
@UseGuards(AdminRoleGuard)
export class AdminReviewSubmissionsController {
  constructor(@Inject(ReviewSubmissionsService) private readonly submissions: ReviewSubmissionsService,
    @Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@Query("status") status: string = "pending") {
    const parsed = z.enum(["pending", "approved", "rejected"]).safeParse(status);
    if (!parsed.success) throw validation();
    return this.submissions.list(parsed.data);
  }

  @Post(":id/decision")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  decide(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) {
    requireSameOriginJson(request, this.config);
    if (!z.string().uuid().safeParse(id).success) throw new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Recenze nebyla nalezena." }, HttpStatus.NOT_FOUND);
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) throw validation();
    return this.submissions.decide(id, parsed.data, { requestId: request.id, session: request.studioSession! });
  }
}

function validation() {
  return new HttpException({ code: "VALIDATION_ERROR", message: "Zkontrolujte údaje recenze a souhlas se zveřejněním." }, HttpStatus.BAD_REQUEST);
}

function requireSameOriginJson(request: FastifyRequest, config: RuntimeConfigService) {
  const expected = new URL(config.value.publicAppUrl ?? "http://localhost:3000").origin;
  if (request.headers.origin !== expected) throw new HttpException({ code: "ORIGIN_REJECTED", message: "Recenzi odešlete přímo z webu studia." }, HttpStatus.FORBIDDEN);
  const contentType = request.headers["content-type"];
  if (!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) throw validation();
}

function validTextLength(value: string, minimum: number, maximum: number) {
  const length = [...value].length;
  return length >= minimum && length <= maximum && !value.includes("\u0000");
}

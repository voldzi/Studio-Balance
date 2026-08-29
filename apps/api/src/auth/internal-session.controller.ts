import { Body, Controller, Header, HttpException, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { InternalSessionGuard } from "./internal-session.guard.js";
import { OpaqueSessionService, type ApplicationSessionKind } from "./opaque-session.service.js";

const sessionSchema = z.object({
  email: z.string().email().max(254),
  emailVerified: z.boolean(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  mfaVerified: z.boolean(),
  roles: z.array(z.enum(["client", "admin", "super_admin"])).max(3),
  subject: z.string().min(1).max(255)
}).strict();
const kindSchema = z.enum(["web", "admin"]);
const createSchema = z.object({
  kind: kindSchema,
  refreshToken: z.string().min(20).max(16_000),
  session: sessionSchema
}).strict();
const tokenSchema = z.object({
  kind: kindSchema,
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
}).strict();

@Controller("api/internal/sessions")
@UseGuards(InternalSessionGuard)
export class InternalSessionController {
  constructor(@Inject(OpaqueSessionService) private readonly sessions: OpaqueSessionService) {}

  @Post()
  @Header("Cache-Control", "no-store")
  async create(@Body() body: unknown) {
    const input = createSchema.safeParse(body);
    if (!input.success) throw invalid();
    const session = {
      subject: input.data.session.subject,
      email: input.data.session.email,
      emailVerified: input.data.session.emailVerified,
      mfaVerified: input.data.session.mfaVerified,
      roles: input.data.session.roles,
      ...(input.data.session.firstName ? { firstName: input.data.session.firstName } : {}),
      ...(input.data.session.lastName ? { lastName: input.data.session.lastName } : {})
    };
    return this.sessions.create({ kind: input.data.kind, refreshToken: input.data.refreshToken, session });
  }

  @Post("resolve")
  @Header("Cache-Control", "no-store")
  async resolve(@Body() body: unknown) {
    const input = tokenSchema.safeParse(body);
    if (!input.success) throw invalid();
    const session = await this.sessions.resolveToken(input.data.token, input.data.kind as ApplicationSessionKind);
    return { session: session ?? null };
  }

  @Post("revoke")
  @Header("Cache-Control", "no-store")
  async revoke(@Body() body: unknown) {
    const input = tokenSchema.safeParse(body);
    if (!input.success) throw invalid();
    await this.sessions.revokeToken(input.data.token, input.data.kind as ApplicationSessionKind);
    return { revoked: true };
  }
}

function invalid(): HttpException {
  return new HttpException({ code: "VALIDATION_ERROR", message: "Neplatný interní požadavek relace." }, HttpStatus.BAD_REQUEST);
}

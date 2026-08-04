import { Body, Controller, Get, Headers, HttpException, HttpStatus, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { SessionAuthGuard, type SessionRequest } from "../auth/session-auth.guard.js";
import { BookingService, CURRENT_TERMS_VERSION } from "./booking.service.js";

const createSchema = z.object({
  sessionId: z.string().uuid(),
  termsVersion: z.literal(CURRENT_TERMS_VERSION),
  termsAccepted: z.literal(true)
}).strict();
const cancelSchema = z.object({ lateCancellationConfirmed: z.boolean() }).strict();
const idSchema = z.string().uuid();

@Controller("api/v1")
@UseGuards(SessionAuthGuard)
export class BookingController {
  constructor(@Inject(BookingService) private readonly bookings: BookingService) {}

  @Post("bookings")
  async create(@Req() request: SessionRequest, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    const input = createSchema.safeParse(body);
    if (!input.success) throw validation("Rezervaci se nepodařilo ověřit.");
    const idempotencyKey = validKey(key);
    return this.bookings.create({ ...input.data, idempotencyKey, requestId: request.id, session: request.studioSession! });
  }

  @Get("me/bookings")
  listMine(@Req() request: SessionRequest) {
    return this.bookings.listMine(request.studioSession!);
  }

  @Get("me/bookings/:bookingId/cancellation-preview")
  preview(@Req() request: SessionRequest, @Param("bookingId") bookingId: string) {
    if (!idSchema.safeParse(bookingId).success) throw notFound();
    return this.bookings.cancellationPreview(request.studioSession!, bookingId);
  }

  @Post("me/bookings/:bookingId/cancel")
  cancel(
    @Req() request: SessionRequest,
    @Param("bookingId") bookingId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ) {
    if (!idSchema.safeParse(bookingId).success) throw notFound();
    const input = cancelSchema.safeParse(body);
    if (!input.success) throw validation("Storno se nepodařilo ověřit.");
    return this.bookings.cancel({
      bookingId,
      idempotencyKey: validKey(key),
      lateCancellationConfirmed: input.data.lateCancellationConfirmed,
      requestId: request.id,
      session: request.studioSession!
    });
  }
}

function validKey(value: string | undefined): string {
  if (!value || value.length < 16 || value.length > 100 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw validation("Chybí platný opakovací klíč požadavku.");
  }
  return value;
}

function validation(message: string): HttpException {
  return new HttpException({ code: "VALIDATION_ERROR", message }, HttpStatus.BAD_REQUEST);
}

function notFound(): HttpException {
  return new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Rezervace nebyla nalezena." }, HttpStatus.NOT_FOUND);
}

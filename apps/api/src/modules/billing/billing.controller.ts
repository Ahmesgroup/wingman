import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { CurrentUser } from "../../common/auth.js";
import { Public } from "../../common/public.decorator.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { BillingAppService } from "./billing.service.js";

const CheckoutSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const PortalSchema = z.object({
  returnUrl: z.string().url(),
});

@Controller("billing")
export class BillingController {
  constructor(@Inject(BillingAppService) private readonly billing: BillingAppService) {}

  @Get("entitlements")
  async entitlements(@CurrentUser() userId: string) {
    const e = await this.billing.entitlementsFor(userId);
    return {
      plan: e.plan,
      status: e.status,
      wingmanPlus: e.wingmanPlus,
      source: e.source,
      effectiveUntil: e.effectiveUntil?.toISOString() ?? null,
      capabilities: {
        dailySignals: e.signalDailyLimit,
        activeConnectionTickets: e.activeConnectionTickets,
        ticketTtlMs: e.ticketMaxDurationMs,
        missionMeetDurationMs: e.missionMeetDurationMs,
        selfieWindowMs: e.selfieWindowMs,
      },
    };
  }

  @Post("checkout")
  async checkout(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(CheckoutSchema)) body: { successUrl: string; cancelUrl: string },
  ) {
    return this.billing.createCheckout(userId, body.successUrl, body.cancelUrl);
  }

  @Post("portal")
  async portal(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(PortalSchema)) body: { returnUrl: string },
  ) {
    return this.billing.createPortal(userId, body.returnUrl);
  }

  /**
   * Stripe webhook — public, signature-verified, idempotent by event.id.
   * Never trusts client isPremium.
   */
  @Public()
  @Post("webhook")
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("stripe-signature") signature?: string,
  ) {
    if (!signature) {
      throw new UnauthorizedException({
        error: { code: "STRIPE_SIGNATURE_MISSING", message: "stripe-signature required" },
      });
    }
    const raw =
      req.rawBody ??
      (typeof req.body === "string" || Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(JSON.stringify(req.body ?? {})));
    const result = await this.billing.handleWebhook(raw, signature);
    if (!result.ok) {
      throw new UnauthorizedException({
        error: { code: "STRIPE_WEBHOOK_REJECTED", message: result.error },
      });
    }
    return { received: true, duplicate: result.duplicate, eventId: result.eventId };
  }
}

import { Body, Controller, Get, Headers, Inject, Injectable, Optional, Post } from "@nestjs/common";
import {
  AuthService,
  assertFieldTestPhoneAllowed,
  assertValidPhoneE164,
  isFieldTestAuthMode,
} from "@wingman/auth";
import type { WingmanEngine } from "@wingman/domain";
import type { OtpDeliveryService } from "@wingman/providers";
import { z } from "zod";
import { Public } from "../../common/public.decorator.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { AUTH_SERVICE_TOKEN, OTP_DELIVERY } from "../infra/infra.tokens.js";
import { AntiAbuseGate } from "../anti-abuse/anti-abuse.module.js";

const RequestOtpSchema = z.object({
  phoneE164: z.string().min(8),
});

const VerifyOtpSchema = z.object({
  phoneE164: z.string().min(8),
  code: z.string().length(6),
  deviceId: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1),
});

@Injectable()
export class AuthApiService {
  constructor(
    @Inject(AUTH_SERVICE_TOKEN) private readonly auth: AuthService,
    @Inject(OTP_DELIVERY) private readonly otpDelivery: OtpDeliveryService,
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Optional() private readonly antiAbuse?: AntiAbuseGate,
  ) {}

  mode() {
    const otpProvider = (process.env.OTP_PROVIDER ?? "local").trim().toLowerCase();
    return {
      fieldTest: isFieldTestAuthMode(),
      authAllowDev: process.env.AUTH_ALLOW_DEV === "true",
      otpProvider: isFieldTestAuthMode()
        ? "field_test"
        : otpProvider === "twilio_verify" || otpProvider === "twilio-verify"
          ? "twilio_verify"
          : "local",
      publicProd:
        process.env.WINGMAN_PUBLIC_PROD === "true" || process.env.NODE_ENV === "production",
    };
  }

  async requestOtp(phoneE164: string) {
    const phone = assertValidPhoneE164(phoneE164);
    if (isFieldTestAuthMode()) assertFieldTestPhoneAllowed(phone);

    const actorKey = `otp:${simpleHash(phone)}`;
    this.antiAbuse?.assertAllowed(actorKey, "OTP_REQUEST");
    const result = await this.otpDelivery.requestAndDeliver(phone);
    this.antiAbuse?.note("auth.otp_request", actorKey, {
      evaluate: true,
      eventId: `otp:${actorKey}:${Date.now()}`,
    });
    return {
      challengeId: result.challengeId,
      debugCode: result.debugCode,
      fieldTest: Boolean(result.fieldTest),
    };
  }

  async verify(body: { phoneE164: string; code: string; deviceId: string }) {
    const phone = assertValidPhoneE164(body.phoneE164);
    if (isFieldTestAuthMode()) assertFieldTestPhoneAllowed(phone);

    const session = await this.otpDelivery.verifyAndComplete(phone, body.code, body.deviceId);
    // Ensure protocol engine knows this real identity (no demo seed / x-user-id).
    // Do not overwrite an existing profile on re-login.
    if (!this.engine.users.has(session.userId)) {
      this.engine.seedUser({
        id: session.userId,
        wingmanPlus: false,
        profile: {
          userId: session.userId,
          gender: "NON_BINARY",
          interestedIn: ["MEN", "WOMEN", "NON_BINARY_PEOPLE"],
        },
      });
    }
    return session;
  }

  async refresh(body: { refreshToken: string; deviceId: string }) {
    return this.auth.refresh(body.refreshToken, body.deviceId);
  }

  async logout(authorization?: string) {
    if (authorization?.startsWith("Bearer ")) {
      await this.auth.revoke(authorization.slice("Bearer ".length));
    }
    return { ok: true };
  }
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

@Public()
@Controller("auth")
export class AuthController {
  constructor(private readonly authApi: AuthApiService) {}

  @Get("mode")
  mode() {
    return this.authApi.mode();
  }

  @Post("otp/request")
  async requestOtp(@Body(new ZodValidationPipe(RequestOtpSchema)) body: { phoneE164: string }) {
    return this.authApi.requestOtp(body.phoneE164);
  }

  @Post("otp/verify")
  async verify(
    @Body(new ZodValidationPipe(VerifyOtpSchema)) body: { phoneE164: string; code: string; deviceId: string },
  ) {
    return this.authApi.verify(body);
  }

  @Post("refresh")
  refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: { refreshToken: string; deviceId: string }) {
    return this.authApi.refresh(body);
  }

  @Post("logout")
  logout(@Headers("authorization") authorization?: string) {
    return this.authApi.logout(authorization);
  }
}

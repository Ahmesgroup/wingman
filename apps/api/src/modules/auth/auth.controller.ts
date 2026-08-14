import { Body, Controller, Headers, Inject, Injectable, Optional, Post } from "@nestjs/common";
import { AuthService } from "@wingman/auth";
import type { OtpDeliveryService } from "@wingman/providers";
import { z } from "zod";
import { Public } from "../../common/public.decorator.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
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
    @Optional() private readonly antiAbuse?: AntiAbuseGate,
  ) {}

  async requestOtp(phoneE164: string) {
    // Hash-stable actor key without logging the phone
    const actorKey = `otp:${simpleHash(phoneE164)}`;
    this.antiAbuse?.assertAllowed(actorKey, "OTP_REQUEST");
    const result = await this.otpDelivery.requestAndDeliver(phoneE164);
    this.antiAbuse?.note("auth.otp_request", actorKey, {
      evaluate: true,
      eventId: `otp:${actorKey}:${Date.now()}`,
    });
    // Never return deliveryCode over HTTP — only optional debugCode when AUTH_DEBUG_OTP
    return { challengeId: result.challengeId, debugCode: result.debugCode };
  }

  verify(body: { phoneE164: string; code: string; deviceId: string }) {
    return this.auth.verifyOtp(body.phoneE164, body.code, body.deviceId);
  }

  refresh(body: { refreshToken: string; deviceId: string }) {
    return this.auth.refresh(body.refreshToken, body.deviceId);
  }

  logout(authorization?: string) {
    if (authorization?.startsWith("Bearer ")) {
      this.auth.revoke(authorization.slice("Bearer ".length));
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

  @Post("otp/request")
  async requestOtp(@Body(new ZodValidationPipe(RequestOtpSchema)) body: { phoneE164: string }) {
    return this.authApi.requestOtp(body.phoneE164);
  }

  @Post("otp/verify")
  verify(@Body(new ZodValidationPipe(VerifyOtpSchema)) body: { phoneE164: string; code: string; deviceId: string }) {
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

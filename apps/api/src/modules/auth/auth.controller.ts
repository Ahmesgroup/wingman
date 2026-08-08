import { Body, Controller, Headers, Inject, Injectable, Post } from "@nestjs/common";
import { AuthService } from "@wingman/auth";
import { z } from "zod";
import { Public } from "../../common/public.decorator.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { AUTH_SERVICE_TOKEN } from "../infra/infra.tokens.js";

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
  constructor(@Inject(AUTH_SERVICE_TOKEN) private readonly auth: AuthService) {}

  requestOtp(phoneE164: string) {
    return this.auth.requestOtp(phoneE164);
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

@Public()
@Controller("auth")
export class AuthController {
  constructor(private readonly authApi: AuthApiService) {}

  @Post("otp/request")
  requestOtp(@Body(new ZodValidationPipe(RequestOtpSchema)) body: { phoneE164: string }) {
    const result = this.authApi.requestOtp(body.phoneE164);
    return result;
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

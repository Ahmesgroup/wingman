import type { AuthService } from "@wingman/auth";
import type { SmsProvider } from "./sms.js";

/**
 * Sends OTP via SmsProvider without storing raw codes outside AuthService.
 * AuthService still owns challenge hashes; this only delivers.
 */
export class OtpDeliveryService {
  constructor(
    private readonly auth: AuthService,
    private readonly sms: SmsProvider,
  ) {}

  async requestAndDeliver(phoneE164: string): Promise<{ challengeId: string; debugCode?: string }> {
    const result = this.auth.requestOtp(phoneE164);
    const code = result.debugCode;
    const body = code
      ? `Your Wingman code is ${code}`
      : "Your Wingman verification code was issued. Open the app to continue.";
    await this.sms.send({
      toE164: phoneE164,
      body,
      idempotencyKey: `otp:${result.challengeId}`,
    });
    return result;
  }
}

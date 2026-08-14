import type { AuthService } from "@wingman/auth";
import type { SmsProvider } from "./sms.js";

/**
 * Sends OTP via SmsProvider without storing raw codes outside AuthService.
 * AuthService owns hashes; deliveryCode is used once for SMS and never returned to HTTP.
 */
export class OtpDeliveryService {
  constructor(
    private readonly auth: AuthService,
    private readonly sms: SmsProvider,
  ) {}

  async requestAndDeliver(phoneE164: string): Promise<{ challengeId: string; debugCode?: string }> {
    const result = this.auth.requestOtp(phoneE164);
    await this.sms.send({
      toE164: phoneE164,
      body: `Your Wingman code is ${result.deliveryCode}`,
      idempotencyKey: `otp:${result.challengeId}`,
    });
    return {
      challengeId: result.challengeId,
      debugCode: result.debugCode,
    };
  }
}

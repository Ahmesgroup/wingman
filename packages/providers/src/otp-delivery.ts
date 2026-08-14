import {
  AuthService,
  assertFieldTestPhoneAllowed,
  getFieldTestOtpCode,
  isFieldTestAuthMode,
  normalizePhoneE164,
} from "@wingman/auth";
import type { SmsProvider } from "./sms.js";

/**
 * Delivers OTP via SmsProvider, or Field-Test mode (allow-list + fixed code, no SMS).
 * AuthService owns hashes; deliveryCode is never returned to HTTP except debugCode.
 */
export class OtpDeliveryService {
  constructor(
    private readonly auth: AuthService,
    private readonly sms: SmsProvider,
  ) {}

  async requestAndDeliver(phoneE164: string): Promise<{
    challengeId: string;
    debugCode?: string;
    fieldTest?: boolean;
  }> {
    const phone = normalizePhoneE164(phoneE164);

    if (isFieldTestAuthMode()) {
      assertFieldTestPhoneAllowed(phone);
      const code = getFieldTestOtpCode();
      const result = this.auth.requestOtp(phone, { deliveryCode: code });
      // No SMS — field-test coordinator shares FIELD_TEST_OTP_CODE out of band.
      return {
        challengeId: result.challengeId,
        debugCode: result.debugCode,
        fieldTest: true,
      };
    }

    const result = this.auth.requestOtp(phone);
    await this.sms.send({
      toE164: phone,
      body: `Your Wingman code is ${result.deliveryCode}`,
      idempotencyKey: `otp:${result.challengeId}`,
    });
    return {
      challengeId: result.challengeId,
      debugCode: result.debugCode,
      fieldTest: false,
    };
  }
}

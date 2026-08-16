import {
  AuthService,
  assertFieldTestPhoneAllowed,
  assertValidPhoneE164,
  getFieldTestOtpCode,
  isFieldTestAuthMode,
} from "@wingman/auth";
import type { SmsProvider } from "./sms.js";
import type { OtpVerificationProvider } from "./twilio-verify.js";

/**
 * Delivers OTP via:
 * - Field-Test mode (allow-list + fixed code, no SMS) — S27A
 * - Twilio Verify (external start/check) — S27B when OTP_PROVIDER=twilio_verify
 * - SmsProvider body delivery (AuthService-generated code) — local/console/programmable SMS
 *
 * AuthService owns challenge/rate-limit/session; deliveryCode is never returned to HTTP except debugCode.
 */
export class OtpDeliveryService {
  constructor(
    private readonly auth: AuthService,
    private readonly sms: SmsProvider,
    private readonly verify: OtpVerificationProvider | null = null,
  ) {}

  async requestAndDeliver(phoneE164: string): Promise<{
    challengeId: string;
    debugCode?: string;
    fieldTest?: boolean;
  }> {
    const phone = assertValidPhoneE164(phoneE164);

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

    if (this.verify) {
      const result = this.auth.requestOtp(phone, { external: true });
      await this.verify.start(phone);
      return {
        challengeId: result.challengeId,
        fieldTest: false,
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

  /**
   * Verify OTP then issue session. Uses Twilio Verify check when configured;
   * otherwise AuthService local hash verify (field-test / SMS body path).
   */
  async verifyAndComplete(
    phoneE164: string,
    code: string,
    deviceId: string,
  ): Promise<{
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }> {
    const phone = assertValidPhoneE164(phoneE164);

    if (isFieldTestAuthMode()) {
      assertFieldTestPhoneAllowed(phone);
      return this.auth.verifyOtp(phone, code, deviceId);
    }

    if (this.verify) {
      await this.verify.check(phone, code);
      return this.auth.completeExternalOtp(phone, deviceId);
    }

    return this.auth.verifyOtp(phone, code, deviceId);
  }
}

import { afterEach, describe, expect, it } from "vitest";
import { AuthError, AuthService } from "./auth-service.js";
import {
  assertFieldTestPhoneAllowed,
  assertValidPhoneE164,
  getFieldTestOtpCode,
  isFieldTestAuthMode,
  normalizePhoneE164,
} from "./field-test.js";

afterEach(() => {
  delete process.env.AUTH_FIELD_TEST_MODE;
  delete process.env.FIELD_TEST_OTP_CODE;
  delete process.env.FIELD_TEST_PHONE_ALLOWLIST;
});

describe("S27A field-test auth helpers", () => {
  it("normalizes E.164", () => {
    expect(normalizePhoneE164("352 621 00 00")).toBe("+3526210000");
    expect(normalizePhoneE164("+3526210000")).toBe("+3526210000");
  });

  it("rejects invalid E.164 before Twilio", () => {
    expect(assertValidPhoneE164("+33612345678")).toBe("+33612345678");
    expect(() => assertValidPhoneE164("123")).toThrow(AuthError);
    expect(() => assertValidPhoneE164("+0123")).toThrow(AuthError);
    try {
      assertValidPhoneE164("not-a-phone");
    } catch (e) {
      expect((e as AuthError).code).toBe("PHONE_INVALID");
    }
  });

  it("gates allow-list strictly", () => {
    process.env.AUTH_FIELD_TEST_MODE = "true";
    process.env.FIELD_TEST_PHONE_ALLOWLIST = "+35211111111,+35222222222";
    expect(() => assertFieldTestPhoneAllowed("+35211111111")).not.toThrow();
    expect(() => assertFieldTestPhoneAllowed("+35299999999")).toThrow(AuthError);
    try {
      assertFieldTestPhoneAllowed("+35299999999");
    } catch (e) {
      expect((e as AuthError).code).toBe("PHONE_NOT_ALLOWED");
    }
  });

  it("rejects empty allow-list", () => {
    process.env.FIELD_TEST_PHONE_ALLOWLIST = "";
    expect(() => assertFieldTestPhoneAllowed("+35211111111")).toThrow(AuthError);
  });

  it("requires 6-digit FIELD_TEST_OTP_CODE", () => {
    process.env.FIELD_TEST_OTP_CODE = "12";
    expect(() => getFieldTestOtpCode()).toThrow(AuthError);
    process.env.FIELD_TEST_OTP_CODE = "482913";
    expect(getFieldTestOtpCode()).toBe("482913");
  });

  it("verify accepts fixed delivery code with rate-limit still active", () => {
    expect(isFieldTestAuthMode()).toBe(false);
    process.env.AUTH_FIELD_TEST_MODE = "true";
    expect(isFieldTestAuthMode()).toBe(true);
    const auth = new AuthService("pepper");
    auth.requestOtp("+35211111111", { deliveryCode: "482913" });
    const session = auth.verifyOtp("+35211111111", "482913", "device-a");
    expect(session.userId).toBeTruthy();
    expect(session.accessToken).toBeTruthy();
    expect(() => auth.verifyOtp("+35211111111", "000000", "device-a")).toThrow(AuthError);
  });
});

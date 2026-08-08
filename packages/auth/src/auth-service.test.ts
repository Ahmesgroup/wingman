import { describe, expect, it } from "vitest";
import { AuthError, AuthService } from "./auth-service.js";

describe("AuthService", () => {
  it("rejects replay after revoke and enforces OTP rate limit", () => {
    const auth = new AuthService("pepper", () => new Date("2026-08-09T00:00:00.000Z"), {
      otpTtlMs: 60_000,
      otpMaxPerPhoneWindow: 2,
      otpWindowMs: 60_000,
      sessionTtlMs: 60_000,
      refreshTtlMs: 120_000,
    });
    process.env.AUTH_DEBUG_OTP = "true";
    auth.requestOtp("+33600000001");
    auth.requestOtp("+33600000001");
    expect(() => auth.requestOtp("+33600000001")).toThrow(AuthError);

    const auth2 = new AuthService("pepper");
    process.env.AUTH_DEBUG_OTP = "true";
    const { debugCode } = auth2.requestOtp("+33600000002");
    const session = auth2.verifyOtp("+33600000002", debugCode!, "device-1");
    const authed = auth2.authenticate(session.accessToken, "device-1");
    expect(authed.userId).toBeTruthy();
    try {
      auth2.authenticate(session.accessToken, "device-2");
      expect.fail("expected device mismatch");
    } catch (e) {
      expect((e as AuthError).code).toBe("DEVICE_MISMATCH");
    }
    auth2.revoke(session.accessToken);
    try {
      auth2.authenticate(session.accessToken, "device-1");
      expect.fail("expected revoked");
    } catch (e) {
      expect(["SESSION_REVOKED", "SESSION_INVALID"]).toContain((e as AuthError).code);
    }
  });
});

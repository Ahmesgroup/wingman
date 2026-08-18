import { describe, expect, it } from "vitest";
import { AuthError, AuthService } from "./auth-service.js";
import { MemoryAuthPersistence } from "./persistence.js";

describe("AuthService", () => {
  it("rejects replay after revoke and enforces OTP rate limit", async () => {
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
    const session = await auth2.verifyOtp("+33600000002", debugCode!, "device-1");
    const authed = await auth2.authenticate(session.accessToken, "device-1");
    expect(authed.userId).toBeTruthy();
    expect(session.accessTtlMs).toBe(60 * 60 * 1000);
    expect(session.refreshTtlMs).toBe(30 * 24 * 60 * 60 * 1000);
    await expect(auth2.authenticate(session.accessToken, "device-2")).rejects.toMatchObject({
      code: "DEVICE_MISMATCH",
    });
    await auth2.revoke(session.accessToken);
    await expect(auth2.authenticate(session.accessToken, "device-1")).rejects.toMatchObject({
      code: expect.stringMatching(/SESSION_REVOKED|SESSION_INVALID/),
    });
  });

  it("external OTP challenge completes without local code hash", async () => {
    const auth = new AuthService("pepper");
    const { challengeId, deliveryCode, debugCode } = auth.requestOtp("+33600000003", {
      external: true,
    });
    expect(challengeId).toBeTruthy();
    expect(deliveryCode).toBe("");
    expect(debugCode).toBeUndefined();
    await expect(auth.verifyOtp("+33600000003", "123456", "device-x")).rejects.toBeInstanceOf(AuthError);
    const session = await auth.completeExternalOtp("+33600000003", "device-x");
    expect(session.accessToken).toBeTruthy();
    await expect(auth.completeExternalOtp("+33600000003", "device-x")).rejects.toBeInstanceOf(AuthError);
  });

  it("shared persistence restores identity+refresh across AuthService instances (serverless)", async () => {
    const store = new MemoryAuthPersistence();
    const a = new AuthService("pepper", () => new Date(), { persistence: store });
    process.env.AUTH_DEBUG_OTP = "true";
    const { debugCode } = a.requestOtp("+35260000001");
    const first = await a.verifyOtp("+35260000001", debugCode!, "dev-a");

    const b = new AuthService("pepper", () => new Date(), { persistence: store });
    const authed = await b.authenticate(first.accessToken, "dev-a");
    expect(authed.userId).toBe(first.userId);

    const refreshed = await b.refresh(first.refreshToken, "dev-a");
    expect(refreshed.userId).toBe(first.userId);
    expect(refreshed.accessToken).not.toBe(first.accessToken);

    const c = new AuthService("pepper", () => new Date(), { persistence: store });
    const again = await c.authenticate(refreshed.accessToken, "dev-a");
    expect(again.userId).toBe(first.userId);

    const { debugCode: code2 } = c.requestOtp("+35260000001");
    const relogin = await c.verifyOtp("+35260000001", code2!, "dev-a");
    expect(relogin.userId).toBe(first.userId);
  });
});

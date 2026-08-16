import { describe, expect, it, vi } from "vitest";
import { AuthError, AuthService } from "@wingman/auth";
import { InvalidDeviceError, NotificationOrchestrator } from "@wingman/notifications";
import {
  ApnsPushProvider,
  ConsoleSmsProvider,
  FcmPushProvider,
  MemoryDeviceTokenStore,
  MobilePushTransport,
  ReliableSmsProvider,
  TwilioSmsProvider,
  TwilioVerifyProvider,
  mapTwilioVerifyHttpError,
} from "./index.js";
import { OtpDeliveryService } from "./otp-delivery.js";

describe("S18 production providers", () => {
  it("SMS reliable wrapper is idempotent and never requires body in logs", async () => {
    const inner = new ConsoleSmsProvider();
    const sms = new ReliableSmsProvider(inner, { maxAttempts: 2, timeoutMs: 2000 });
    const a = await sms.send({ toE164: "+33600000000", body: "code 123456", idempotencyKey: "otp:1" });
    const b = await sms.send({ toE164: "+33600000000", body: "code 123456", idempotencyKey: "otp:1" });
    expect(a.providerMessageId).toBe(b.providerMessageId);
    expect(inner.sent).toHaveLength(1);
  });

  it("Twilio adapter posts form body with redacted logging contract", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sid: "SMtest123" }),
    })) as unknown as typeof fetch;
    const twilio = new TwilioSmsProvider({
      accountSid: "ACxxx",
      authToken: "secret",
      fromE164: "+15550001111",
      fetchImpl,
      timeoutMs: 2000,
    });
    const res = await twilio.send({
      toE164: "+33611112222",
      body: "Your Wingman code is 999999",
      idempotencyKey: "otp:chal1",
    });
    expect(res.providerMessageId).toBe("SMtest123");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("otp:chal1");
  });


  it("OTP delivery puts code in SMS body without AUTH_DEBUG_OTP", async () => {
    delete process.env.AUTH_DEBUG_OTP;
    delete process.env.AUTH_FIELD_TEST_MODE;
    const auth = new AuthService("pepper");
    const inner = new ConsoleSmsProvider();
    const delivery = new OtpDeliveryService(auth, inner);
    const res = await delivery.requestAndDeliver("+33699999999");
    expect(res.challengeId).toBeTruthy();
    expect(res.debugCode).toBeUndefined();
    expect(res.fieldTest).toBe(false);
    expect(inner.sent[0]!.body).toMatch(/Your Wingman code is \d{6}/);
  });

  it("OTP delivery still goes through SmsProvider port only", async () => {
    process.env.AUTH_DEBUG_OTP = "true";
    delete process.env.AUTH_FIELD_TEST_MODE;
    const auth = new AuthService("pepper");
    const sms = new ReliableSmsProvider(new ConsoleSmsProvider());
    const delivery = new OtpDeliveryService(auth, sms);
    const res = await delivery.requestAndDeliver("+33699999999");
    expect(res.challengeId).toBeTruthy();
    expect(res.debugCode).toMatch(/^\d{6}$/);
  });

  it("field-test OTP skips SMS and uses fixed code + allow-list", async () => {
    process.env.AUTH_FIELD_TEST_MODE = "true";
    process.env.FIELD_TEST_OTP_CODE = "482913";
    process.env.FIELD_TEST_PHONE_ALLOWLIST = "+35211111111,+35222222222";
    delete process.env.AUTH_DEBUG_OTP;
    const auth = new AuthService("pepper");
    const inner = new ConsoleSmsProvider();
    const delivery = new OtpDeliveryService(auth, inner);
    const res = await delivery.requestAndDeliver("+35211111111");
    expect(res.fieldTest).toBe(true);
    expect(inner.sent).toHaveLength(0);
    const session = await delivery.verifyAndComplete("+35211111111", "482913", "d1");
    expect(session.accessToken).toBeTruthy();
    await expect(delivery.requestAndDeliver("+35299999999")).rejects.toThrow();
    delete process.env.AUTH_FIELD_TEST_MODE;
    delete process.env.FIELD_TEST_OTP_CODE;
    delete process.env.FIELD_TEST_PHONE_ALLOWLIST;
  });

  it("Twilio Verify start/check maps errors and issues session without SMS body", async () => {
    delete process.env.AUTH_FIELD_TEST_MODE;
    delete process.env.AUTH_DEBUG_OTP;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: "VExxx", status: "pending" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: "VExxx", status: "approved" }),
      }) as unknown as typeof fetch;
    const verify = new TwilioVerifyProvider({
      accountSid: "ACtest",
      authToken: "secret",
      serviceSid: "VAtest",
      fetchImpl,
      timeoutMs: 2000,
    });
    const auth = new AuthService("pepper");
    const sms = new ConsoleSmsProvider();
    const delivery = new OtpDeliveryService(auth, sms, verify);
    const req = await delivery.requestAndDeliver("+33612345678");
    expect(req.challengeId).toBeTruthy();
    expect(req.debugCode).toBeUndefined();
    expect(sms.sent).toHaveLength(0);
    const session = await delivery.verifyAndComplete("+33612345678", "123456", "dev-1");
    expect(session.accessToken).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("Twilio Verify wrong code stays OTP_INVALID", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "pending" }),
    })) as unknown as typeof fetch;
    const verify = new TwilioVerifyProvider({
      accountSid: "ACtest",
      authToken: "secret",
      serviceSid: "VAtest",
      fetchImpl,
    });
    await expect(verify.check("+33612345678", "000000")).rejects.toMatchObject({
      code: "OTP_INVALID",
    });
  });

  it("maps Twilio Verify HTTP codes into AuthError", () => {
    expect(mapTwilioVerifyHttpError(429, { code: 60203 }).code).toBe("OTP_RATE_LIMITED");
    expect(mapTwilioVerifyHttpError(404, { code: 20404 }).code).toBe("OTP_EXPIRED");
    expect(mapTwilioVerifyHttpError(400, { code: 60200 }).code).toBe("PHONE_INVALID");
    expect(mapTwilioVerifyHttpError(400, { code: 99999 })).toBeInstanceOf(AuthError);
  });

  it("twilio_verify without Auth Token boots as misconfigured (blocks SMS, no crash)", async () => {
    const prev = {
      OTP_PROVIDER: process.env.OTP_PROVIDER,
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
    };
    process.env.OTP_PROVIDER = "twilio_verify";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VAtest";
    delete process.env.TWILIO_AUTH_TOKEN;
    const { createOtpVerificationFromEnv } = await import("./twilio-verify.js");
    const verify = createOtpVerificationFromEnv();
    expect(verify?.name).toBe("twilio_verify_misconfigured");
    await expect(verify!.start("+33612345678")).rejects.toMatchObject({ code: "OTP_INVALID" });
    process.env.OTP_PROVIDER = prev.OTP_PROVIDER;
    process.env.TWILIO_ACCOUNT_SID = prev.TWILIO_ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = prev.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_VERIFY_SERVICE_SID = prev.TWILIO_VERIFY_SERVICE_SID;
  });

  it("mobile push fans out to android+ios and cleans invalid tokens", async () => {
    const store = new MemoryDeviceTokenStore();
    await store.upsert({
      userId: "u1",
      deviceId: "d-android",
      platform: "android",
      pushToken: "tok-android",
    });
    await store.upsert({
      userId: "u1",
      deviceId: "d-ios",
      platform: "ios",
      pushToken: "tok-ios-bad",
    });
    const fcm = new FcmPushProvider();
    const apns = new ApnsPushProvider();
    apns.markInvalid("tok-ios-bad");
    const transport = new MobilePushTransport(store, [fcm, apns]);
    const orch = new NotificationOrchestrator(transport, 2);
    orch.handleAppEvent({
      type: "signal.received",
      userId: "u1",
      aggregateId: "sig1",
    });
    await orch.processQueue();
    expect(fcm.sent).toHaveLength(1);
    expect((await store.getByToken("tok-ios-bad"))?.active).toBe(false);
    expect(orch.getDelivery("signal.received:sig1:u1")?.status).toBe("SENT");
    expect(orch.getDelivery("signal.received:sig1:u1")?.providerMessageId).toBeTruthy();
  });

  it("same app event is not double-notified on replay", async () => {
    const store = new MemoryDeviceTokenStore();
    await store.upsert({
      userId: "u1",
      deviceId: "d1",
      platform: "android",
      pushToken: "t1",
    });
    const fcm = new FcmPushProvider();
    const orch = new NotificationOrchestrator(new MobilePushTransport(store, [fcm]), 2);
    const a = orch.handleAppEvent({ type: "match.created", userId: "u1", aggregateId: "c1" });
    const b = orch.handleAppEvent({ type: "match.created", userId: "u1", aggregateId: "c1" });
    expect(a.accepted).toBe(true);
    expect(b.duplicate).toBe(true);
    await orch.processQueue();
    expect(fcm.sent).toHaveLength(1);
  });

  it("invalid-only fanout marks INVALID_DEVICE without crashing orchestrator", async () => {
    const store = new MemoryDeviceTokenStore();
    await store.upsert({
      userId: "u1",
      deviceId: "d1",
      platform: "android",
      pushToken: "dead",
    });
    const fcm = new FcmPushProvider();
    fcm.markInvalid("dead");
    const orch = new NotificationOrchestrator(new MobilePushTransport(store, [fcm]), 2);
    orch.handleAppEvent({ type: "mission.expired", userId: "u1", aggregateId: "c9" });
    await orch.processQueue();
    expect(orch.getDelivery("mission.expired:c9:u1")?.status).toBe("INVALID_DEVICE");
    expect(() => {
      throw new InvalidDeviceError("dead");
    }).toThrow(InvalidDeviceError);
  });
});

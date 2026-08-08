import { describe, expect, it } from "vitest";
import { AuthService } from "@wingman/auth";
import { NotificationOrchestrator } from "@wingman/notifications";
import { ConsoleSmsProvider } from "./sms.js";
import { FlakyPushTransport, LoggingPushTransport } from "./push.js";
import { OtpDeliveryService } from "./otp-delivery.js";

describe("S14 provider ports", () => {
  it("delivers OTP through SMS port without exposing phone in provider logs contract", async () => {
    process.env.AUTH_DEBUG_OTP = "true";
    const auth = new AuthService("pepper");
    const sms = new ConsoleSmsProvider();
    const delivery = new OtpDeliveryService(auth, sms);
    const res = await delivery.requestAndDeliver("+33699999999");
    expect(res.challengeId).toBeTruthy();
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]!.idempotencyKey).toContain(res.challengeId);
  });

  it("push logging transport integrates with orchestrator idempotency", async () => {
    const transport = new LoggingPushTransport();
    const orch = new NotificationOrchestrator(transport, 2);
    const event = {
      id: "e1",
      type: "signal.received" as const,
      userId: "u1",
      idempotencyKey: "k1",
      deepLink: "wingman://signals/1",
      payload: {},
      createdAt: new Date(),
    };
    orch.enqueue(event);
    orch.enqueue(event);
    await orch.processQueue();
    expect(transport.sent).toHaveLength(1);
  });

  it("flaky push recovers via retries", async () => {
    const transport = new FlakyPushTransport(1);
    const orch = new NotificationOrchestrator(transport, 3);
    orch.enqueue({
      id: "e2",
      type: "mission.opened",
      userId: "u1",
      idempotencyKey: "k2",
      deepLink: "wingman://missions/1",
      payload: {},
      createdAt: new Date(),
    });
    await orch.processQueue();
    await orch.processQueue();
    expect(transport.sent).toHaveLength(1);
    expect(orch.getDelivery("k2")?.status).toBe("SENT");
  });
});

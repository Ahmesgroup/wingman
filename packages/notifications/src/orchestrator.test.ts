import { describe, expect, it } from "vitest";
import { InMemoryPushTransport, NotificationOrchestrator } from "./orchestrator.js";

describe("NotificationOrchestrator", () => {
  it("does not double-send and dead-letters after max retries", async () => {
    const transport = new InMemoryPushTransport();
    const orch = new NotificationOrchestrator(transport, 2);
    const event = {
      id: "e1",
      type: "signal.received" as const,
      userId: "u1",
      idempotencyKey: "sig:abc",
      deepLink: orch.deepLinkFor("signal.received", "abc"),
      payload: {},
      createdAt: new Date(),
    };
    expect(orch.enqueue(event).accepted).toBe(true);
    expect(orch.enqueue(event).duplicate).toBe(true);
    await orch.processQueue();
    expect(transport.sent).toHaveLength(1);
    expect(orch.getDelivery("sig:abc")?.status).toBe("SENT");

    transport.failNext = true;
    const e2 = { ...event, id: "e2", idempotencyKey: "sig:fail" };
    orch.enqueue(e2);
    await orch.processQueue();
    transport.failNext = true;
    await orch.processQueue();
    expect(orch.getDelivery("sig:fail")?.status).toBe("DEAD");
    expect(orch.getDeadLetters()).toHaveLength(1);
  });
});

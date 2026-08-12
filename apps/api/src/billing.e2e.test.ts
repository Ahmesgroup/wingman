import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { CachedBillingStateStore, FakeStripeBillingPort } from "@wingman/billing";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { createNestApp } from "./testing/create-nest-app.js";

const SIG = "t=1,v1=whsec_test";

describe("S19 billing → entitlements e2e", () => {
  it("Free cannot self-promote; webhook grants Plus; replay is idempotent", async () => {
    const clock = new FakeClock(new Date("2026-08-08T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      stripePort: new FakeStripeBillingPort("whsec_test"),
      billingStore: new CachedBillingStateStore(),
    });
    const server = app.getHttpServer();

    await request(server)
      .post("/dev/seed")
      .send({ id: "u1", gender: "MALE", interestedIn: ["WOMEN"] })
      .expect(201);

    // Client cannot self-promote via query/body — entitlements stay FREE
    const free = await request(server)
      .get("/billing/entitlements")
      .set("x-user-id", "u1")
      .query({ isPremium: "true" })
      .expect(200);
    expect(free.body.plan).toBe("FREE");
    expect(free.body.capabilities.dailySignals).toBe(2);

    const event = {
      id: "evt_e2e_1",
      type: "customer.subscription.created",
      created: 1,
      subscription: {
        id: "sub_e2e",
        customerId: "cus_e2e",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
        userId: "u1",
      },
    };

    const first = await request(server)
      .post("/billing/webhook")
      .set("stripe-signature", SIG)
      .send(event)
      .expect(200);
    expect(first.body.duplicate).toBe(false);

    const replay = await request(server)
      .post("/billing/webhook")
      .set("stripe-signature", SIG)
      .send(event)
      .expect(200);
    expect(replay.body.duplicate).toBe(true);

    const plus = await request(server).get("/billing/entitlements").set("x-user-id", "u1").expect(200);
    expect(plus.body.plan).toBe("WINGMAN_PLUS");
    expect(plus.body.capabilities.dailySignals).toBe(25);
    expect(plus.body.capabilities.activeConnectionTickets).toBe(3);

    // Engine path uses entitlements.forUser — Plus signal limit
    expect(engine.entitlements("u1").signalDailyLimit).toBe(25);

    await app.close();
  });

  it("invalid signature does not change entitlements; Stripe outage shape does not break core", async () => {
    const engine = new WingmanEngine({ clock: new FakeClock(new Date("2026-08-08T18:00:00.000Z")) });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      stripePort: new FakeStripeBillingPort("whsec_test"),
      billingStore: new CachedBillingStateStore(),
    });
    const server = app.getHttpServer();

    await request(server)
      .post("/dev/seed")
      .send({ id: "u2", gender: "FEMALE", interestedIn: ["MEN"] })
      .expect(201);

    await request(server)
      .post("/billing/webhook")
      .set("stripe-signature", "t=1,v1=wrong")
      .send({ id: "evt_bad", type: "customer.subscription.created" })
      .expect(401);

    const e = await request(server).get("/billing/entitlements").set("x-user-id", "u2").expect(200);
    expect(e.body.plan).toBe("FREE");

    // Core radar still works without Stripe
    await request(server)
      .post("/radar/activate")
      .set("x-user-id", "u2")
      .send({ lat: 48.85, lng: 2.35 })
      .expect(201);

    await app.close();
  });

  it("checkout is fail-closed when payments disabled (default)", async () => {
    const engine = new WingmanEngine({ clock: new FakeClock(new Date("2026-08-08T18:00:00.000Z")) });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      stripePort: new FakeStripeBillingPort("whsec_test"),
      billingStore: new CachedBillingStateStore(),
    });
    const server = app.getHttpServer();

    await request(server)
      .post("/dev/seed")
      .send({ id: "u3", gender: "MALE", interestedIn: ["WOMEN"] })
      .expect(201);

    const status = await request(server)
      .get("/billing/payments/status")
      .set("x-user-id", "u3")
      .expect(200);
    expect(status.body.paymentsEnabled).toBe(false);
    expect(status.body.provider).toBe("disabled");

    const checkout = await request(server)
      .post("/billing/checkout")
      .set("x-user-id", "u3")
      .send({ successUrl: "https://example.com/ok", cancelUrl: "https://example.com/cancel" })
      .expect(503);
    expect(checkout.body.error.code).toBe("PAYMENTS_DISABLED");

    await app.close();
  });
});

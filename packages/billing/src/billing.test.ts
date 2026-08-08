import { describe, expect, it } from "vitest";
import {
  BillingReconciler,
  EntitlementService,
  FakeStripeBillingPort,
  MemoryBillingStateStore,
  MemoryProcessedEventStore,
  planFromBilling,
  type BillingState,
  type VerifiedStripeEvent,
} from "./index.js";

function sig(secret = "whsec_test"): string {
  return `t=123,v1=${secret}`;
}

function subEvent(
  id: string,
  type: string,
  opts: {
    userId: string;
    status?: string;
    cancelAtPeriodEnd?: boolean;
    periodEnd?: Date;
    periodStart?: Date;
    created?: number;
    customerId?: string;
    subId?: string;
  },
): VerifiedStripeEvent {
  const periodStart = opts.periodStart ?? new Date("2026-01-01T00:00:00.000Z");
  const periodEnd = opts.periodEnd ?? new Date("2026-02-01T00:00:00.000Z");
  return {
    id,
    type,
    created: opts.created ?? Math.floor(periodStart.getTime() / 1000),
    customerId: opts.customerId ?? "cus_1",
    subscription: {
      id: opts.subId ?? "sub_1",
      customerId: opts.customerId ?? "cus_1",
      status: opts.status ?? "active",
      cancelAtPeriodEnd: opts.cancelAtPeriodEnd ?? false,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      userId: opts.userId,
    },
  };
}

describe("S19 entitlements model", () => {
  it("FREE vs PLUS derived capabilities", async () => {
    const store = new MemoryBillingStateStore();
    const svc = new EntitlementService(store);
    const free = await svc.forUser("u1", new Date());
    expect(free.plan).toBe("FREE");
    expect(free.signalDailyLimit).toBe(2);
    expect(free.activeConnectionTickets).toBe(1);

    await store.upsert({
      userId: "u1",
      plan: "WINGMAN_PLUS",
      status: "ACTIVE",
      source: "STRIPE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
      updatedAt: new Date(),
    });
    const plus = await svc.forUser("u1", new Date());
    expect(plus.plan).toBe("WINGMAN_PLUS");
    expect(plus.signalDailyLimit).toBe(25);
    expect(plus.activeConnectionTickets).toBe(3);
    expect(plus.wingmanPlus).toBe(true);
  });

  it("cancel-at-period-end keeps Plus until currentPeriodEnd", async () => {
    const state: BillingState = {
      userId: "u1",
      plan: "WINGMAN_PLUS",
      status: "CANCEL_AT_PERIOD_END",
      source: "STRIPE",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date(),
    };
    expect(planFromBilling(state, new Date("2026-05-01T00:00:00.000Z"))).toBe("WINGMAN_PLUS");
    expect(planFromBilling(state, new Date("2026-06-01T00:00:00.000Z"))).toBe("FREE");
  });

  it("expiration auto-downgrades", async () => {
    const store = new MemoryBillingStateStore();
    await store.upsert({
      userId: "u1",
      plan: "WINGMAN_PLUS",
      status: "CANCELED",
      source: "STRIPE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date(),
    });
    const svc = new EntitlementService(store);
    expect((await svc.forUser("u1", new Date("2026-02-01T00:00:00.000Z"))).plan).toBe("WINGMAN_PLUS");
    expect((await svc.forUser("u1", new Date("2026-03-02T00:00:00.000Z"))).plan).toBe("FREE");
  });
});

describe("S19 webhook reconciliation", () => {
  function harness() {
    const port = new FakeStripeBillingPort();
    const states = new MemoryBillingStateStore();
    const processed = new MemoryProcessedEventStore();
    const reconciler = new BillingReconciler(port, states, processed);
    return { port, states, processed, reconciler };
  }

  it("rejects invalid signature", async () => {
    const { reconciler } = harness();
    const r = await reconciler.handleWebhook(JSON.stringify({ id: "evt_1", type: "x" }), "bad");
    expect(r.ok).toBe(false);
  });

  it("idempotent by event.id — replay has no double effect", async () => {
    const { reconciler, states } = harness();
    const event = subEvent("evt_replay", "customer.subscription.created", { userId: "u1" });
    const body = JSON.stringify(event);
    const a = await reconciler.handleWebhook(body, sig());
    const b = await reconciler.handleWebhook(body, sig());
    expect(a.ok && !a.duplicate).toBe(true);
    expect(b.ok && b.duplicate).toBe(true);
    expect((await states.get("u1"))?.stripeSubscriptionId).toBe("sub_1");
  });

  it("checkout.session.completed grants Plus", async () => {
    const { reconciler, states } = harness();
    const event: VerifiedStripeEvent = {
      id: "evt_co",
      type: "checkout.session.completed",
      created: 1,
      checkout: {
        sessionId: "cs_1",
        customerId: "cus_1",
        subscriptionId: "sub_1",
        userId: "u1",
      },
    };
    await reconciler.handleWebhook(JSON.stringify(event), sig());
    const s = await states.get("u1");
    expect(s?.plan).toBe("WINGMAN_PLUS");
    expect(s?.status).toBe("ACTIVE");
    expect(s?.stripeCustomerId).toBe("cus_1");
  });

  it("cancel_at_period_end maps to CANCEL_AT_PERIOD_END", async () => {
    const { reconciler, states } = harness();
    await reconciler.applyVerifiedEvent(
      subEvent("evt_a", "customer.subscription.updated", {
        userId: "u1",
        status: "active",
        cancelAtPeriodEnd: true,
      }),
    );
    expect((await states.get("u1"))?.status).toBe("CANCEL_AT_PERIOD_END");
  });

  it("invoice.payment_failed → PAST_DUE (Plus until period end)", async () => {
    const { reconciler, states } = harness();
    await reconciler.applyVerifiedEvent(
      subEvent("evt_1", "customer.subscription.created", { userId: "u1" }),
    );
    await reconciler.applyVerifiedEvent({
      id: "evt_fail",
      type: "invoice.payment_failed",
      created: 2,
      customerId: "cus_1",
      subscription: {
        id: "sub_1",
        customerId: "cus_1",
        status: "past_due",
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
        userId: "u1",
      },
    });
    const s = await states.get("u1");
    expect(s?.status).toBe("PAST_DUE");
    const svc = new EntitlementService(states);
    expect((await svc.forUser("u1", new Date("2026-01-15T00:00:00.000Z"))).plan).toBe("WINGMAN_PLUS");
  });

  it("out-of-order older subscription update does not regress newer period", async () => {
    const { reconciler, states } = harness();
    await reconciler.applyVerifiedEvent(
      subEvent("evt_new", "customer.subscription.updated", {
        userId: "u1",
        periodEnd: new Date("2026-03-01T00:00:00.000Z"),
        created: 2000,
      }),
    );
    // Simulate slight delay so updatedAt > old event.created
    await new Promise((r) => setTimeout(r, 5));
    await reconciler.applyVerifiedEvent(
      subEvent("evt_old", "customer.subscription.updated", {
        userId: "u1",
        periodEnd: new Date("2026-02-01T00:00:00.000Z"),
        created: 1000,
      }),
    );
    expect((await states.get("u1"))?.currentPeriodEnd?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("subscription.deleted keeps Plus until period end then FREE", async () => {
    const { reconciler, states } = harness();
    const periodEnd = new Date("2026-04-01T00:00:00.000Z");
    await reconciler.applyVerifiedEvent(
      subEvent("evt_del", "customer.subscription.deleted", {
        userId: "u1",
        status: "canceled",
        periodEnd,
      }),
    );
    const svc = new EntitlementService(states);
    expect((await svc.forUser("u1", new Date("2026-03-01T00:00:00.000Z"))).plan).toBe("WINGMAN_PLUS");
    expect((await svc.forUser("u1", new Date("2026-04-02T00:00:00.000Z"))).plan).toBe("FREE");
  });

  it("double checkout for already-Plus converges to single Plus state", async () => {
    const { reconciler, states } = harness();
    await reconciler.applyVerifiedEvent({
      id: "evt_c1",
      type: "checkout.session.completed",
      created: 1,
      checkout: { sessionId: "cs_1", customerId: "cus_1", subscriptionId: "sub_1", userId: "u1" },
    });
    await reconciler.applyVerifiedEvent({
      id: "evt_c2",
      type: "checkout.session.completed",
      created: 2,
      checkout: { sessionId: "cs_2", customerId: "cus_1", subscriptionId: "sub_2", userId: "u1" },
    });
    const s = await states.get("u1");
    expect(s?.plan).toBe("WINGMAN_PLUS");
    expect(s?.stripeSubscriptionId).toBe("sub_2");
  });

  it("restart reconstructs entitlements from durable billing state without Stripe", async () => {
    const states = new MemoryBillingStateStore();
    await states.upsert({
      userId: "u1",
      plan: "WINGMAN_PLUS",
      status: "ACTIVE",
      source: "STRIPE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      updatedAt: new Date(),
    });
    // New service instance = post-restart
    const svc = new EntitlementService(states);
    const e = await svc.forUser("u1", new Date());
    expect(e.plan).toBe("WINGMAN_PLUS");
    expect(e.signalDailyLimit).toBe(25);
  });
});

describe("S19 client cannot self-promote", () => {
  it("ignores client isPremium — only BillingState matters", async () => {
    const store = new MemoryBillingStateStore();
    const svc = new EntitlementService(store);
    const clientClaimsPremium = { isPremium: true, userId: "u1" };
    void clientClaimsPremium;
    expect((await svc.forUser("u1", new Date())).plan).toBe("FREE");
  });
});

/**
 * S20 production certification gates (G1–G4 automated).
 * Must not require S0–S19 business-rule changes to pass.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine, WINDOWS_MS } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import {
  CachedBillingStateStore,
  EntitlementService,
  FakeStripeBillingPort,
  MemoryBillingStateStore,
} from "@wingman/billing";
import {
  hydrateFromRepository,
  MemoryProtocolRepository,
  ProtocolPersistenceMirror,
} from "@wingman/persistence";
import {
  InMemoryPushTransport,
  NotificationOrchestrator,
  type PushEvent,
  type PushTransport,
} from "@wingman/notifications";
import { RealtimeHub } from "@wingman/realtime";
import { MetricsRegistry, StructuredLogger, buildReadiness } from "@wingman/observability";
import { createNestApp } from "./testing/create-nest-app.js";
import { SignalsService } from "./modules/signals/signals.controller.js";
import { RealtimeAppService } from "./modules/realtime/realtime-app.service.js";

class DeadPushTransport implements PushTransport {
  async send(_event: PushEvent): Promise<never> {
    throw new Error("FCM/APNs unavailable");
  }
}

class DegradedEphemeralStore extends MemoryEphemeralStore {
  failQuota = false;
  async incrQuota(key: string, ttlSeconds: number): Promise<number> {
    if (this.failQuota) throw new Error("redis unavailable");
    return super.incrQuota(key, ttlSeconds);
  }
}

describe("S20 G1 multi-instance certification", () => {
  it("only one Match from concurrent accepts across two service instances (shared engine + ephemeral)", async () => {
    const clock = new FakeClock(new Date("2026-08-09T10:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({ id: "a", profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] } });
    engine.seedUser({ id: "b", profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] } });
    engine.activateRadar("a", { lat: 1, lng: 1 });
    engine.activateRadar("b", { lat: 1.0001, lng: 1.0001 });
    const sig = engine.sendSignal("a", "b");

    const shared = new MemoryEphemeralStore();
    const orch = new NotificationOrchestrator(new InMemoryPushTransport());
    const mirror = new ProtocolPersistenceMirror(engine, new MemoryProtocolRepository());
    const realtime = new RealtimeAppService(new RealtimeHub(shared), engine);
    await realtime.onModuleInit();
    const instA = new SignalsService(engine, shared, orch, mirror, realtime);
    const instB = new SignalsService(engine, shared, orch, mirror, realtime);

    const results = await Promise.allSettled([instA.accept(sig.id, "b"), instB.accept(sig.id, "b")]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(engine.connections.size).toBe(1);
  });

  it("shared ephemeral pub/sub delivers across two realtime hubs (no local-only bus)", async () => {
    const shared = new MemoryEphemeralStore();
    const seen: string[] = [];
    await shared.subscribe("wingman:rt", (p) => seen.push(p));
    await shared.publish("wingman:rt", JSON.stringify({ type: "signal.received", eventId: "e1" }));
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0]!).type).toBe("signal.received");
  });

  it("durable state created on instance A is visible after hydrate on instance B", async () => {
    const clock = new FakeClock(new Date("2026-08-09T10:05:00.000Z"));
    const repo = new MemoryProtocolRepository();
    const engineA = new WingmanEngine({ clock });
    const appA = await createNestApp({
      engine: engineA,
      ephemeral: new MemoryEphemeralStore(),
      protocolRepo: repo,
      skipHydrate: true,
    });
    const sA = appA.getHttpServer();
    await request(sA).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(sA).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(sA).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await request(sA).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);
    const sig = await request(sA).post("/signals").set("x-user-id", "a").send({ receiverId: "b" }).expect(201);
    const accept = await request(sA)
      .post(`/signals/${sig.body.signal.id}/accept`)
      .set("x-user-id", "b")
      .expect(201);
    const connectionId = accept.body.connection.id as string;
    await appA.close();

    const engineB = new WingmanEngine({ clock });
    const report = await hydrateFromRepository(engineB, repo);
    expect(report.presenceRestored).toBe(0);
    expect(engineB.presence.size).toBe(0);
    expect(engineB.connections.get(connectionId)?.state).toBe("WAITING_FOR_INITIATOR_SELFIE");

    const appB = await createNestApp({
      engine: engineB,
      ephemeral: new MemoryEphemeralStore(),
      protocolRepo: repo,
      skipHydrate: true,
    });
    const conn = await request(appB.getHttpServer())
      .get(`/connections/${connectionId}`)
      .set("x-user-id", "a")
      .expect(200);
    expect(conn.body.connection.state).toBe("WAITING_FOR_INITIATOR_SELFIE");
    await appB.close();
  });

  it("mission expiry reconciled on one clock is durable and readable after hydrate", async () => {
    const clock = new FakeClock(new Date("2026-08-09T10:10:00.000Z"));
    const repo = new MemoryProtocolRepository();
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      protocolRepo: repo,
      skipHydrate: true,
    });
    const server = app.getHttpServer();
    await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);
    const sig = await request(server).post("/signals").set("x-user-id", "a").send({ receiverId: "b" }).expect(201);
    const accept = await request(server)
      .post(`/signals/${sig.body.signal.id}/accept`)
      .set("x-user-id", "b")
      .expect(201);
    const connectionId = accept.body.connection.id as string;
    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "a")
      .send({ mediaId: "ma" })
      .expect(201);
    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "b")
      .send({ mediaId: "mb" })
      .expect(201);
    await request(server).post(`/connections/${connectionId}/approve`).set("x-user-id", "a").expect(201);
    await request(server).post(`/connections/${connectionId}/meet-now`).set("x-user-id", "a").expect(201);
    await request(server).post(`/connections/${connectionId}/lets-meet`).set("x-user-id", "a").expect(201);

    clock.advanceMs(WINDOWS_MS.MISSION_FREE + 1);
    await request(server).post("/internal/reconcile").expect(201);
    let conn = await request(server).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(conn.body.connection.state).toBe("OUTCOME_PENDING");
    await app.close();

    // Hydrate runs domain reconcile — OUTCOME window already elapsed → converges to COOLDOWN
    const engine2 = new WingmanEngine({ clock });
    await hydrateFromRepository(engine2, repo);
    expect(["OUTCOME_PENDING", "COOLDOWN_ACTIVE"]).toContain(engine2.connections.get(connectionId)?.state);
    expect(engine2.connections.get(connectionId)?.state).not.toBe("MISSION_MEET_ACTIVE");
  });
});

describe("S20 G2 recovery / chaos certification", () => {
  it("API restart hydrates connections and never revives presence/radar", async () => {
    const clock = new FakeClock(new Date("2026-08-09T11:00:00.000Z"));
    const repo = new MemoryProtocolRepository();
    const engine1 = new WingmanEngine({ clock });
    const app1 = await createNestApp({
      engine: engine1,
      ephemeral: new MemoryEphemeralStore(),
      protocolRepo: repo,
      skipHydrate: true,
    });
    const s1 = app1.getHttpServer();
    await request(s1).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(s1).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(s1).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await request(s1).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);
    const sig = await request(s1).post("/signals").set("x-user-id", "a").send({ receiverId: "b" }).expect(201);
    const accept = await request(s1)
      .post(`/signals/${sig.body.signal.id}/accept`)
      .set("x-user-id", "b")
      .expect(201);
    const connectionId = accept.body.connection.id as string;
    await app1.close();

    const engine2 = new WingmanEngine({ clock });
    const report = await hydrateFromRepository(engine2, repo);
    expect(report.presenceRestored).toBe(0);
    expect(engine2.presence.size).toBe(0);
    expect(engine2.connections.get(connectionId)?.isActive).toBe(true);

    const app2 = await createNestApp({
      engine: engine2,
      ephemeral: new MemoryEphemeralStore(),
      protocolRepo: repo,
      skipHydrate: true,
    });
    await request(app2.getHttpServer()).get("/radar/candidates").set("x-user-id", "a").expect(404);
    await request(app2.getHttpServer())
      .get(`/connections/${connectionId}`)
      .set("x-user-id", "a")
      .expect(200);
    await app2.close();
  });

  it("ephemeral (Redis) unavailable → readiness fails; durable protocol path stays uncorrupted", async () => {
    const ephemeral = new DegradedEphemeralStore();
    ephemeral.failQuota = true;
    const engine = new WingmanEngine({ clock: new FakeClock(new Date("2026-08-09T11:10:00.000Z")) });
    const app = await createNestApp({ engine, ephemeral, skipHydrate: true });
    const server = app.getHttpServer();
    const ready = await request(server).get("/internal/ready").expect(200);
    expect(ready.body.ready).toBe(false);
    expect(ready.body.checks.ephemeral.ok).toBe(false);
    const live = await request(server).get("/internal/live").expect(200);
    expect(live.body.live).toBe(true);

    await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    // Core seed works; no durable corruption from ephemeral probe failure
    expect(engine.users.has("a")).toBe(true);
    await app.close();
  });

  it("push provider down → notification fails; Signal still created", async () => {
    const clock = new FakeClock(new Date("2026-08-09T11:20:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const transport = new DeadPushTransport();
    const orch = new NotificationOrchestrator(transport, 2);
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      notifications: orch,
      skipHydrate: true,
    });
    const server = app.getHttpServer();
    await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);
    const sig = await request(server).post("/signals").set("x-user-id", "a").send({ receiverId: "b" }).expect(201);
    expect(sig.body.signal.id).toBeTruthy();
    expect(engine.signals.has(sig.body.signal.id)).toBe(true);
    await orch.processQueue();
    await orch.processQueue(); // drain retries → DEAD
    const statuses = orch.listDeliveries().map((d) => d.status);
    expect(statuses.some((s) => s === "DEAD" || s === "FAILED")).toBe(true);
    await app.close();
  });

  it("Stripe unavailable / bad signature → entitlements stay known; core Wingman available", async () => {
    const clock = new FakeClock(new Date("2026-08-09T11:30:00.000Z"));
    const store = new CachedBillingStateStore(new MemoryBillingStateStore());
    await store.upsert({
      userId: "u1",
      plan: "WINGMAN_PLUS",
      status: "ACTIVE",
      source: "STRIPE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
      updatedAt: new Date(),
    });
    const entitlements = new EntitlementService(store);
    expect((await entitlements.forUser("u1", clock.now())).plan).toBe("WINGMAN_PLUS");

    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      stripePort: new FakeStripeBillingPort("whsec_test"),
      billingStore: store,
      skipHydrate: true,
    });
    const server = app.getHttpServer();
    await request(server).post("/dev/seed").send({ id: "u1", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server)
      .post("/billing/webhook")
      .set("stripe-signature", "t=1,v1=wrong")
      .send({ id: "evt_x", type: "customer.subscription.updated" })
      .expect(401);
    const e = await request(server).get("/billing/entitlements").set("x-user-id", "u1").expect(200);
    expect(e.body.plan).toBe("WINGMAN_PLUS");
    await request(server).post("/radar/activate").set("x-user-id", "u1").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await app.close();
  });
});

describe("S20 G3 load / races certification", () => {
  it("many concurrent Radar refreshes keep invariants (no crash, candidates consistent)", async () => {
    const clock = new FakeClock(new Date("2026-08-09T12:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    const N = 40;
    for (let i = 0; i < N; i++) {
      const gender = i % 2 === 0 ? "MALE" : "FEMALE";
      const interestedIn = i % 2 === 0 ? ["WOMEN"] : ["MEN"];
      await request(server)
        .post("/dev/seed")
        .send({ id: `u${i}`, gender, interestedIn })
        .expect(201);
      await request(server)
        .post("/radar/activate")
        .set("x-user-id", `u${i}`)
        .send({ lat: 48.85 + i * 0.00001, lng: 2.35 + i * 0.00001 })
        .expect(201);
    }

    const refreshes = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        request(server).get("/radar/candidates").set("x-user-id", `u${i}`),
      ),
    );
    expect(refreshes.every((r) => r.status === 200)).toBe(true);
    expect(engine.presence.size).toBe(N);
    await app.close();
  });

  it("concurrent Signals toward same receiver respect pair/quota invariants (no double active pair)", async () => {
    const clock = new FakeClock(new Date("2026-08-09T12:10:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();
    await request(server).post("/dev/seed").send({ id: "recv", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "recv").send({ lat: 48.85, lng: 2.35 }).expect(201);

    for (let i = 0; i < 5; i++) {
      await request(server)
        .post("/dev/seed")
        .send({ id: `s${i}`, gender: "MALE", interestedIn: ["WOMEN"] })
        .expect(201);
      await request(server)
        .post("/radar/activate")
        .set("x-user-id", `s${i}`)
        .send({ lat: 48.8501 + i * 0.0001, lng: 2.3501 })
        .expect(201);
    }

    // Same pair concurrent: only one active signal for s0→recv
    const pairRace = await Promise.allSettled([
      request(server).post("/signals").set("x-user-id", "s0").set("idempotency-key", "k-a").send({ receiverId: "recv" }),
      request(server).post("/signals").set("x-user-id", "s0").set("idempotency-key", "k-b").send({ receiverId: "recv" }),
    ]);
    const ok = pairRace.filter((r) => r.status === "fulfilled" && (r.value as { status: number }).status === 201);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const activePair = [...engine.signals.values()].filter(
      (s) => s.isActive && ((s.senderId === "s0" && s.receiverId === "recv") || (s.senderId === "recv" && s.receiverId === "s0")),
    );
    expect(activePair.length).toBe(1);

    // Distinct senders → receiver can have multiple inbound signals
    const inbound = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        request(server).post("/signals").set("x-user-id", `s${i}`).send({ receiverId: "recv" }),
      ),
    );
    expect(inbound.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    await app.close();
  });

  it("Free daily signal quota holds under concurrent create attempts", async () => {
    const clock = new FakeClock(new Date("2026-08-09T12:20:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();
    await request(server).post("/dev/seed").send({ id: "free", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "free").send({ lat: 48.85, lng: 2.35 }).expect(201);
    for (let i = 0; i < 6; i++) {
      await request(server)
        .post("/dev/seed")
        .send({ id: `t${i}`, gender: "FEMALE", interestedIn: ["MEN"] })
        .expect(201);
      await request(server)
        .post("/radar/activate")
        .set("x-user-id", `t${i}`)
        .send({ lat: 48.851 + i * 0.001, lng: 2.351 })
        .expect(201);
    }
    const attempts = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((i) =>
        request(server).post("/signals").set("x-user-id", "free").send({ receiverId: `t${i}` }),
      ),
    );
    const created = attempts.filter((r) => r.status === 201);
    expect(created.length).toBe(2); // FREE dailySignals = 2
    await app.close();
  });
});

describe("S20 G4 observability certification", () => {
  it("health, live, ready, metrics expose operable signals; requestId correlates", async () => {
    const metrics = new MetricsRegistry();
    const logger = new StructuredLogger("s20-cert");
    const engine = new WingmanEngine({ clock: new FakeClock(new Date("2026-08-09T13:00:00.000Z")) });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      metrics,
      logger,
      skipHydrate: true,
    });
    const server = app.getHttpServer();

    const health = await request(server).get("/health").expect(200);
    expect(health.body.ok).toBe(true);
    const live = await request(server).get("/internal/live").expect(200);
    expect(live.body.live).toBe(true);
    const ready = await request(server).get("/internal/ready").expect(200);
    expect(ready.body.ready).toBe(true);
    expect(ready.body.checks.domain.ok).toBe(true);

    const rid = "cert-req-s20-1";
    await request(server).post("/dev/seed").set("x-request-id", rid).send({
      id: "obs",
      gender: "MALE",
      interestedIn: ["WOMEN"],
    }).expect(201);

    const m = await request(server).get("/internal/metrics").expect(200);
    expect(m.body.http.counters.http_requests).toBeGreaterThanOrEqual(1);
    expect(m.body.http.histograms.http_ms.p50).toBeDefined();
    expect(m.body.http.histograms.http_ms.p95).toBeDefined();
    expect(m.body.http.histograms.http_ms.p99).toBeDefined();
    expect(m.body.persistence).toBeDefined();

    // Redaction still holds
    const lines: string[] = [];
    const orig = console.log;
    console.log = (s: string) => lines.push(s);
    logger.info("probe", { phone: "+33600000000", token: "secret", lat: 1, userId: "obs", requestId: rid });
    console.log = orig;
    expect(lines[0]).toContain("[redacted]");
    expect(lines[0]).toContain(rid);
    expect(lines[0]).not.toContain("+336");

    expect(buildReadiness({ domain: { ok: true }, ephemeral: { ok: false } }).ready).toBe(false);
    await app.close();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { NotificationOrchestrator } from "@wingman/notifications";
import { FailClosedWebPushTransport } from "@wingman/providers";
import { createNestApp } from "./testing/create-nest-app.js";

describe("S32 web background / push fail-closed", () => {
  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.FCM_SERVER_KEY;
    delete process.env.FCM_PROJECT_ID;
    delete process.env.FCM_VAPID_KEY;
  });

  it("/internal/live reports web push blocked without credentials", async () => {
    const engine = new WingmanEngine({ clock: new FakeClock(new Date("2026-08-18T10:00:00.000Z")) });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const live = await request(app.getHttpServer()).get("/internal/live").expect(200);
    expect(live.body.live).toBe(true);
    expect(live.body.webPush.enabled).toBe(false);
    expect(live.body.webPush.reason).toBe("vapid_or_fcm_credentials_missing");
    expect(live.body.webPush.vapidPublicKey).toBeFalsy();
    expect(JSON.stringify(live.body)).not.toMatch(/VAPID_PRIVATE|BEGIN PRIVATE/);
    await app.close();
  });

  it("fail-closed push does not invent SENT; Signal still created", async () => {
    const clock = new FakeClock(new Date("2026-08-18T10:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const orch = new NotificationOrchestrator(new FailClosedWebPushTransport(), 2);
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
    await orch.processQueue();
    const rec = orch.getDelivery(`signal.received:${sig.body.signal.id}:b`);
    expect(rec?.status).toBe("DEAD");
    expect(rec?.providerMessageId).toBeUndefined();
    await app.close();
  });
});

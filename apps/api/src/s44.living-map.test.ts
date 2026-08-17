import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { payloadLeaksCoordinates } from "@wingman/radar-intelligence";
import { createNestApp } from "./testing/create-nest-app.js";

describe("S44 Living Map / Discover / Pulse", () => {
  afterEach(() => {
    delete process.env.WINGMAN_LIVING_MAP_V1;
  });

  it("flag defaults off and /radar/candidates rollback remains", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    const live = await request(server).get("/internal/live").expect(200);
    expect(live.body.livingMap).toBe(false);

    const status = await request(server).get("/radar/living-map").set("x-user-id", "v").expect(200);
    expect(status.body.enabled).toBe(false);

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    const cands = await request(server).get("/radar/candidates").set("x-user-id", "v").expect(200);
    expect(cands.body.candidates).toEqual([]);
    await app.close();
  });

  it("0 eligible candidates → 0 opportunities / 0 markers payload", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "solo", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "solo").send({ lat: 48.8566, lng: 2.3522 }).expect(201);

    const res = await request(server).get("/radar/opportunities").set("x-user-id", "solo").expect(200);
    expect(res.body.opportunities).toEqual([]);
    expect(res.body.count).toBe(0);
    expect(res.body.clusters).toEqual([]);
    expect(payloadLeaksCoordinates(res.body)).toBe(false);
    await app.close();
  });

  it("1 eligible candidate is privacy-safe (no peer lat/lng)", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "near", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "near").send({ lat: 48.8567, lng: 2.3523 }).expect(201);

    const res = await request(server).get("/radar/opportunities").set("x-user-id", "v").expect(200);
    expect(res.body.opportunities).toHaveLength(1);
    const o = res.body.opportunities[0];
    expect(o.userId).toBe("near");
    expect(o.opportunityId).toMatch(/^[0-9a-f]{16}$/);
    expect(o.distanceBand).toMatch(/VERY_CLOSE|NEARBY|AROUND_ME/);
    expect(o.bearingBucket).toBeTruthy();
    expect(o.displayZone).toEqual({ ring: o.distanceBand, sector: o.bearingBucket });
    expect(o.lat).toBeUndefined();
    expect(o.lng).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/"lat"/);
    expect(JSON.stringify(res.body)).not.toMatch(/"lng"/);
    expect(payloadLeaksCoordinates(res.body)).toBe(false);
    await app.close();
  });

  it("blocked / expired / out-of-radius / hidden stay out", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "ok", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "blocked", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "far", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "hidden", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);

    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "ok").send({ lat: 48.8501, lng: 2.3501 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "blocked").send({ lat: 48.8502, lng: 2.3502 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "far").send({ lat: 49.0, lng: 2.5 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "hidden").send({ lat: 48.8503, lng: 2.3503, visibility: "INVISIBLE" }).expect(201);
    await request(server).post("/safety/block").set("x-user-id", "v").send({ userId: "blocked" }).expect(201);

    const res = await request(server).get("/radar/opportunities").set("x-user-id", "v").expect(200);
    const ids = res.body.opportunities.map((c: { userId: string }) => c.userId);
    expect(ids).toContain("ok");
    expect(ids).not.toContain("blocked");
    expect(ids).not.toContain("far");
    expect(ids).not.toContain("hidden");
    expect(ids).not.toContain("v");
    await app.close();
  });

  it("expired presence is removed from opportunities", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "near", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "near").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
    expect((await request(server).get("/radar/opportunities").set("x-user-id", "v").expect(200)).body.opportunities).toHaveLength(1);

    clock.advanceMs(130_000);
    engine.reapPresence();
    const after = await request(server).get("/radar/opportunities").set("x-user-id", "v");
    expect(after.status === 200 || after.status === 404).toBe(true);
    if (after.status === 200) expect(after.body.opportunities).toEqual([]);
    await app.close();
  });

  it("filters reduce the authorized set", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "a", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    engine.updateProfile("a", {
      gender: "FEMALE",
      interestedIn: ["MEN"],
      mood: "SUPER_READY",
      intention: "AVAILABLE_NOW",
      interests: ["Music"],
    });
    engine.updateProfile("b", {
      gender: "FEMALE",
      interestedIn: ["MEN"],
      mood: "OPEN",
      intention: "JUST_EXPLORING",
      interests: ["Food"],
    });

    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8575, lng: 2.3535 }).expect(201);

    const all = await request(server).get("/radar/opportunities").set("x-user-id", "v").expect(200);
    expect(all.body.opportunities.length).toBe(2);

    const ready = await request(server)
      .get("/radar/opportunities?presence=SUPER_READY")
      .set("x-user-id", "v")
      .expect(200);
    expect(ready.body.opportunities.map((o: { userId: string }) => o.userId)).toEqual(["a"]);

    const music = await request(server)
      .get("/radar/opportunities?interests=Music")
      .set("x-user-id", "v")
      .expect(200);
    expect(music.body.opportunities.map((o: { userId: string }) => o.userId)).toEqual(["a"]);

    const disc = await request(server).get("/radar/discover?presence=OPEN").set("x-user-id", "v").expect(200);
    expect(disc.body.opportunities.map((o: { userId: string }) => o.userId)).toEqual(["b"]);
    await app.close();
  });

  it("Pulse below threshold is quiet and non-identifying", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "a", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8567, lng: 2.3523 }).expect(201);

    const pulse = await request(server).get("/radar/pulse").set("x-user-id", "v").expect(200);
    expect(pulse.body.quiet).toBe(true);
    expect(pulse.body.message).toBe("Activity is quiet nearby");
    expect(pulse.body.opportunityCount).toBeUndefined();
    expect(JSON.stringify(pulse.body).toLowerCase()).not.toContain("woman");
    expect(payloadLeaksCoordinates(pulse.body)).toBe(false);
    await app.close();
  });

  it("Signal from opportunity uses existing /signals API", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "near", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "near").send({ lat: 48.8567, lng: 2.3523 }).expect(201);

    const opp = await request(server).get("/radar/opportunities").set("x-user-id", "v").expect(200);
    const target = opp.body.opportunities[0].userId;
    const sig = await request(server)
      .post("/signals")
      .set("x-user-id", "v")
      .set("idempotency-key", "s44-sig-1")
      .send({ receiverId: target, source: "RADAR" })
      .expect(201);
    expect(sig.body.signal.receiverId).toBe("near");
    expect(sig.body.signal.source).toBe("RADAR");
    await app.close();
  });

  it("large candidate set is bounded", async () => {
    const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);

    for (let i = 0; i < 120; i++) {
      const id = `p${i}`;
      await request(server).post("/dev/seed").send({ id, gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
      const dlat = 0.00008 * ((i % 20) + 1);
      const dlng = 0.00008 * (Math.floor(i / 20) + 1);
      await request(server)
        .post("/radar/activate")
        .set("x-user-id", id)
        .send({ lat: 48.8566 + dlat, lng: 2.3522 + dlng })
        .expect(201);
    }

    const res = await request(server).get("/radar/opportunities").set("x-user-id", "v").expect(200);
    expect(res.body.opportunities.length).toBeLessThanOrEqual(100);
    expect(res.body.count).toBeGreaterThan(100);
    expect(res.body.truncated).toBe(true);
    expect(payloadLeaksCoordinates(res.body)).toBe(false);
    await app.close();
  });
});

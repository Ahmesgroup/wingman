import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { ExposureStore } from "@wingman/radar-intelligence";
import { createNestApp } from "./testing/create-nest-app.js";
import { setRadarIntelligenceOverrides } from "./modules/radar/radar.module.js";
import { RadarService } from "./modules/radar/radar.controller.js";

describe("S21 Radar Intelligence Nest gate", () => {
  afterEach(() => {
    delete process.env.RADAR_INTELLIGENCE_ENABLED;
    setRadarIntelligenceOverrides({});
  });

  it("flag off returns V1 order unchanged (eligibility-only)", async () => {
    process.env.RADAR_INTELLIGENCE_ENABLED = "false";
    const clock = new FakeClock(new Date("2026-08-09T14:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "near", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "far", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);

    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "near").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "far").send({ lat: 48.8575, lng: 2.3535 }).expect(201);

    const v1Direct = engine.getCandidates("v").map((c) => c.userId);
    const res = await request(server).get("/radar/candidates").set("x-user-id", "v").expect(200);
    expect(res.body.candidates.map((c: { userId: string }) => c.userId)).toEqual(v1Direct);
    expect(JSON.stringify(res.body)).not.toContain("score");
    await app.close();
  });

  it("flag on: same candidate set as V1, improved order, scores never in response", async () => {
    process.env.RADAR_INTELLIGENCE_ENABLED = "true";
    const hints = new Map<string, string[]>([
      ["v", ["FR"]],
      ["near", ["FR"]],
      ["far", ["EN"]],
    ]);
    setRadarIntelligenceOverrides({ languageHints: hints, exposure: new ExposureStore() });

    const clock = new FakeClock(new Date("2026-08-09T14:10:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "near", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "far", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);

    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    // near ~15m, far ~150m within around 200
    await request(server).post("/radar/activate").set("x-user-id", "near").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "far").send({ lat: 48.8578, lng: 2.3538 }).expect(201);

    const v1Ids = new Set(engine.getCandidates("v").map((c) => c.userId));
    const res = await request(server).get("/radar/candidates").set("x-user-id", "v").expect(200);
    const ordered: string[] = res.body.candidates.map((c: { userId: string }) => c.userId);
    expect(new Set(ordered)).toEqual(v1Ids);
    expect(ordered[0]).toBe("near");
    expect(JSON.stringify(res.body)).not.toMatch(/"score"/);
    expect(res.body.candidates.every((c: Record<string, unknown>) => c.lat === undefined && c.lng === undefined)).toBe(
      true,
    );

    const radar = app.get(RadarService);
    const audit = radar.getLastRankingAudit();
    expect(audit?.engine).toBe("RADAR_RANKING");
    expect(audit?.decisions.every((d) => typeof d.score === "number")).toBe(true);

    await app.close();
  });

  it("flag on never adds candidates V1 rejected (blocked / invisible stay out)", async () => {
    process.env.RADAR_INTELLIGENCE_ENABLED = "true";
    const clock = new FakeClock(new Date("2026-08-09T14:20:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "ok", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "blocked", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);

    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "ok").send({ lat: 48.8501, lng: 2.3501 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "blocked").send({ lat: 48.8502, lng: 2.3502 }).expect(201);
    await request(server).post("/safety/block").set("x-user-id", "v").send({ userId: "blocked" }).expect(201);

    const res = await request(server).get("/radar/candidates").set("x-user-id", "v").expect(200);
    const ids = res.body.candidates.map((c: { userId: string }) => c.userId);
    expect(ids).toContain("ok");
    expect(ids).not.toContain("blocked");
    await app.close();
  });
});

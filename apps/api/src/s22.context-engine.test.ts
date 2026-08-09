import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryContextInputStore } from "@wingman/context-engine";
import { ExposureStore } from "@wingman/radar-intelligence";
import { createNestApp } from "./testing/create-nest-app.js";
import { setContextEngineOverrides } from "./modules/context/context.module.js";
import { setRadarIntelligenceOverrides } from "./modules/radar/radar.module.js";
import { RadarService } from "./modules/radar/radar.controller.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("S22 Context Engine Nest gates", () => {
  afterEach(() => {
    delete process.env.RADAR_INTELLIGENCE_ENABLED;
    delete process.env.CONTEXT_ENGINE_ENABLED;
    setContextEngineOverrides({});
    setRadarIntelligenceOverrides({});
  });

  it("CONTEXT flag off = exact S21 behavior (language hints path)", async () => {
    process.env.RADAR_INTELLIGENCE_ENABLED = "true";
    process.env.CONTEXT_ENGINE_ENABLED = "false";
    const hints = new Map<string, string[]>([
      ["v", ["FR"]],
      ["near", ["FR"]],
      ["far", ["EN"]],
    ]);
    setRadarIntelligenceOverrides({ languageHints: hints, exposure: new ExposureStore() });

    const clock = new FakeClock(new Date("2026-08-09T15:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "near", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "far", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "near").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "far").send({ lat: 48.8578, lng: 2.3538 }).expect(201);

    const res = await request(server).get("/radar/candidates").set("x-user-id", "v").expect(200);
    expect(res.body.candidates[0].userId).toBe("near");
    expect(JSON.stringify(res.body)).not.toMatch(/confidence|capturedAt|expiresAt|"score"/);
    await app.close();
  });

  it("CONTEXT flag on: same candidate set; unknown language neutral; no sensitive dump", async () => {
    process.env.RADAR_INTELLIGENCE_ENABLED = "true";
    process.env.CONTEXT_ENGINE_ENABLED = "true";
    const store = new MemoryContextInputStore();
    store.upsert({ userId: "v", languages: ["fr"], mobility: "walking" });
    store.upsert({ userId: "a", languages: ["fr"], availabilityMinutes: 30 });
    // b has no languages — must remain eligible and not penalized as incompatible
    store.upsert({ userId: "b", availabilityMinutes: 5 });
    setContextEngineOverrides({ store });
    setRadarIntelligenceOverrides({ exposure: new ExposureStore() });

    const clock = new FakeClock(new Date("2026-08-09T15:10:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "a", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8568, lng: 2.3524 }).expect(201);

    const v1 = new Set(engine.getCandidates("v").map((c) => c.userId));
    const res = await request(server).get("/radar/candidates").set("x-user-id", "v").expect(200);
    const ids = res.body.candidates.map((c: { userId: string }) => c.userId);
    expect(new Set(ids)).toEqual(v1);
    expect(ids).toContain("b");
    expect(ids[0]).toBe("a"); // shared language + availability
    expect(JSON.stringify(res.body)).not.toMatch(/confidence|mobility|availabilityMinutes|lat|lng|"score"/);

    const audit = app.get(RadarService).getLastRankingAudit();
    expect(audit?.decisions.find((d) => d.candidateId === "a")?.reasons).toContain("shared_language");
    expect(audit?.decisions.find((d) => d.candidateId === "b")?.reasons.includes("shared_language")).toBe(false);

    await app.close();
  });

  it("expired context is ignored (neutral)", async () => {
    process.env.RADAR_INTELLIGENCE_ENABLED = "true";
    process.env.CONTEXT_ENGINE_ENABLED = "true";
    const store = new MemoryContextInputStore();
    const past = new Date("2026-08-09T12:00:00.000Z");
    store.upsert({
      userId: "a",
      languages: ["fr"],
      availabilityMinutes: 1,
      capturedAt: past,
    });
    setContextEngineOverrides({ store });

    const clock = new FakeClock(new Date("2026-08-09T18:00:00.000Z")); // well past ephemeral TTL
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();

    await request(server).post("/dev/seed").send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "a", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8501, lng: 2.3501 }).expect(201);

    await request(server).get("/radar/candidates").set("x-user-id", "v").expect(200);
    const audit = app.get(RadarService).getLastRankingAudit();
    expect(audit?.decisions.find((d) => d.candidateId === "a")?.reasons.includes("shared_language")).toBe(false);
    await app.close();
  });
});

describe("S22 architecture: radar-intelligence does not import context-engine implementation", () => {
  it("packages/radar-intelligence has no @wingman/context-engine imports", () => {
    const root = join(__dirname, "..", "..", "..", "packages", "radar-intelligence", "src");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
      }
      return out;
    };
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/from\s+["']@wingman\/context-engine["']/);
    }
  });

  it("domain never imports context-engine", () => {
    const root = join(__dirname, "..", "..", "..", "packages", "domain", "src");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
      }
      return out;
    };
    for (const file of walk(root)) {
      expect(readFileSync(file, "utf8")).not.toMatch(/context-engine/);
    }
  });
});

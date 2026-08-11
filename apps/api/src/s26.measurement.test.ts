import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryMeasurementStore, MeasurementEngine } from "@wingman/measurement";
import { createNestApp } from "./testing/create-nest-app.js";
import { setMeasurementOverrides } from "./modules/measurement/measurement.module.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("S26 Measurement Nest gates", () => {
  afterEach(() => {
    delete process.env.MEASUREMENT_ENABLED;
    delete process.env.MEASUREMENT_LEARNING_ENABLED;
    delete process.env.RADAR_INTELLIGENCE_ENABLED;
    setMeasurementOverrides({});
  });

  it(
    "flag OFF = no measurement report payload (enabled:false)",
    async () => {
      process.env.MEASUREMENT_ENABLED = "false";
      const clock = new FakeClock(new Date("2026-08-11T16:00:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
      const report = await request(server).get("/internal/measurement/report").expect(200);
      expect(report.body).toEqual({ enabled: false });
      await app.close();
    },
    30_000,
  );

  it(
    "flag ON: observes signal/block; report has no lat/lng; learning stays false",
    async () => {
      process.env.MEASUREMENT_ENABLED = "true";
      process.env.MEASUREMENT_LEARNING_ENABLED = "false";
      process.env.RADAR_INTELLIGENCE_ENABLED = "true";
      const store = new MemoryMeasurementStore();
      setMeasurementOverrides({ store, engine: new MeasurementEngine(store) });

      const clock = new FakeClock(new Date("2026-08-11T16:10:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();

      await request(server)
        .post("/dev/seed")
        .send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"], wingmanPlus: true })
        .expect(201);
      await request(server)
        .post("/dev/seed")
        .send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"], wingmanPlus: true })
        .expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
      await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200);
      await request(server)
        .post("/signals")
        .set("x-user-id", "a")
        .send({ receiverId: "b", source: "RADAR" })
        .expect(201);
      await request(server).post("/safety/block").set("x-user-id", "b").send({ userId: "a" }).expect(201);

      const report = await request(server).get("/internal/measurement/report").expect(200);
      expect(report.body.learningEnabled).toBe(false);
      expect(report.body.quality.signalsCreated).toBeGreaterThanOrEqual(1);
      expect(report.body.safety.blocksIssued).toBeGreaterThanOrEqual(1);
      expect(report.body.byEngine.RADAR_RANKING?.decisions).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(report.body)).not.toMatch(/"lat"|"lng"|phone|selfie/);
      expect(report.body.flagsSeen.MEASUREMENT_LEARNING_ENABLED).toBe(false);

      await app.close();
    },
    30_000,
  );

  it(
    "does not change V1 Signal path when measurement on",
    async () => {
      process.env.MEASUREMENT_ENABLED = "true";
      const store = new MemoryMeasurementStore();
      setMeasurementOverrides({ store, engine: new MeasurementEngine(store) });
      const clock = new FakeClock(new Date("2026-08-11T16:20:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);
      const res = await request(server)
        .post("/signals")
        .set("x-user-id", "a")
        .send({ receiverId: "b", source: "RADAR" })
        .expect(201);
      expect(res.body.signal?.id).toBeTruthy();
      expect(engine.signals.size).toBe(1);
      await app.close();
    },
    30_000,
  );
});

describe("S26 architecture: domain never imports measurement", () => {
  it("packages/domain has no @wingman/measurement", () => {
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
      expect(readFileSync(file, "utf8")).not.toMatch(/@wingman\/measurement/);
    }
  });
});

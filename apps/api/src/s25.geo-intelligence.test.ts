import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import {
  GeoIntelligenceEngine,
  MemoryGeoSnapshotStore,
  DEFAULT_GEO_POLICY,
} from "@wingman/geo-intelligence";
import { createNestApp } from "./testing/create-nest-app.js";
import { setGeoOverrides } from "./modules/geo/geo.module.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("S25 Geo Intelligence Nest gates", () => {
  afterEach(() => {
    delete process.env.GEO_INTELLIGENCE_ENABLED;
    delete process.env.GEO_ADAPTIVE_RADIUS_ENABLED;
    delete process.env.RADAR_INTELLIGENCE_ENABLED;
    setGeoOverrides({});
  });

  it(
    "flag OFF = previous geo behavior; no spatialCell in HTTP",
    async () => {
      process.env.GEO_INTELLIGENCE_ENABLED = "false";
      const clock = new FakeClock(new Date("2026-08-09T19:00:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await request(server)
        .post("/dev/seed")
        .send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] })
        .expect(201);
      await request(server)
        .post("/dev/seed")
        .send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] })
        .expect(201);
      const act = await request(server)
        .post("/radar/activate")
        .set("x-user-id", "a")
        .send({ lat: 49.612345, lng: 6.131234 })
        .expect(201);
      expect(JSON.stringify(act.body)).not.toMatch(/spatialCell|49\.612|6\.131/);
      await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 49.6124, lng: 6.1313 }).expect(201);
      const cand = await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200);
      expect(JSON.stringify(cand.body)).not.toMatch(/"lat"|"lng"|spatialCell|distanceMeters/);
      await app.close();
    },
    30_000,
  );

  it(
    "flag ON: same V1 eligibility set; no exact coords in HTTP; geo enriches ranking only",
    async () => {
      process.env.GEO_INTELLIGENCE_ENABLED = "true";
      process.env.GEO_ADAPTIVE_RADIUS_ENABLED = "true";
      process.env.RADAR_INTELLIGENCE_ENABLED = "true";
      const store = new MemoryGeoSnapshotStore();
      setGeoOverrides({
        store,
        engine: new GeoIntelligenceEngine(store, DEFAULT_GEO_POLICY, true),
      });
      const clock = new FakeClock(new Date("2026-08-09T19:10:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();

      await request(server)
        .post("/dev/seed")
        .send({ id: "v", gender: "MALE", interestedIn: ["WOMEN"] })
        .expect(201);
      await request(server)
        .post("/dev/seed")
        .send({ id: "near", gender: "FEMALE", interestedIn: ["MEN"] })
        .expect(201);
      await request(server)
        .post("/dev/seed")
        .send({ id: "far", gender: "FEMALE", interestedIn: ["MEN"] })
        .expect(201);

      // Capture V1 set with geo off path first via domain
      engine.activateRadar("v", { lat: 48.8566, lng: 2.3522 });
      engine.activateRadar("near", { lat: 48.8567, lng: 2.3523 });
      engine.activateRadar("far", { lat: 48.858, lng: 2.354 });
      const v1Ids = engine.getCandidates("v").map((c) => c.userId).sort();

      // Nest activate with geo
      await request(server).post("/radar/activate").set("x-user-id", "v").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "near").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "far").send({ lat: 48.858, lng: 2.354 }).expect(201);

      const res = await request(server).get("/radar/candidates").set("x-user-id", "v").expect(200);
      const ids = (res.body.candidates as { userId: string }[]).map((c) => c.userId).sort();
      expect(ids).toEqual(v1Ids);
      expect(JSON.stringify(res.body)).not.toMatch(/"lat"|"lng"|distanceMeters|49\.|cell_/);

      // Snapshots exist server-side
      expect(store.get("v")?.spatialCell).toMatch(/^cell_/);
      expect(JSON.stringify(store.get("v"))).not.toMatch(/48\.8566/); // quantized may still have 48.857

      await app.close();
    },
    30_000,
  );

  it(
    "expired geo snapshot ignored; block still dominates eligibility",
    async () => {
      process.env.GEO_INTELLIGENCE_ENABLED = "true";
      const store = new MemoryGeoSnapshotStore();
      setGeoOverrides({
        store,
        engine: new GeoIntelligenceEngine(store, { ...DEFAULT_GEO_POLICY, snapshotTtlMs: 1000 }),
      });
      const clock = new FakeClock(new Date("2026-08-09T19:20:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);

      clock.advanceMs(2000);
      const geoEngine = new GeoIntelligenceEngine(store, { ...DEFAULT_GEO_POLICY, snapshotTtlMs: 1000 });
      expect(geoEngine.forUser("a", clock.now())).toBeUndefined();

      await request(server).post("/safety/block").set("x-user-id", "a").send({ userId: "b" }).expect(201);
      const cand = await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200);
      expect(cand.body.candidates).toEqual([]);

      await app.close();
    },
    30_000,
  );

  it(
    "shared geo store: multi-instance same snapshot",
    async () => {
      process.env.GEO_INTELLIGENCE_ENABLED = "true";
      const shared = new MemoryGeoSnapshotStore();
      const geoEngine = new GeoIntelligenceEngine(shared);
      setGeoOverrides({ store: shared, engine: geoEngine });
      const clock = new FakeClock(new Date("2026-08-09T19:30:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
      await app.close();

      const other = new GeoIntelligenceEngine(shared);
      expect(other.forUser("a", clock.now())?.spatialCell).toBe(shared.get("a")?.spatialCell);
    },
    30_000,
  );
});

describe("S25 architecture: domain never imports geo-intelligence", () => {
  it("packages/domain has no @wingman/geo-intelligence", () => {
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
      expect(readFileSync(file, "utf8")).not.toMatch(/@wingman\/geo-intelligence/);
    }
  });
});

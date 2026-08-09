import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import {
  AntiAbuseEngine,
  DEFAULT_POLICY_THRESHOLDS,
  MemoryAbuseStateStore,
} from "@wingman/anti-abuse";
import { createNestApp } from "./testing/create-nest-app.js";
import { setAntiAbuseOverrides } from "./modules/anti-abuse/anti-abuse.module.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedEligiblePair(server: ReturnType<Awaited<ReturnType<typeof createNestApp>>["getHttpServer"]>) {
  await request(server)
    .post("/dev/seed")
    .send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"], wingmanPlus: true })
    .expect(201);
  await request(server)
    .post("/dev/seed")
    .send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"], wingmanPlus: true })
    .expect(201);
  for (let i = 0; i < 4; i++) {
    await request(server)
      .post("/dev/seed")
      .send({
        id: `t${i}`,
        gender: "FEMALE",
        interestedIn: ["MEN"],
        wingmanPlus: true,
      })
      .expect(201);
  }
  // Billing entitlements override seed wingmanPlus → force Plus on domain seed flag for quota tests
  await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
  await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
  for (let i = 0; i < 4; i++) {
    await request(server)
      .post("/radar/activate")
      .set("x-user-id", `t${i}`)
      .send({ lat: 48.8566 + i * 0.0001, lng: 2.3522 })
      .expect(201);
  }
}

describe("S24 Anti-Abuse Nest gates", () => {
  afterEach(() => {
    delete process.env.ANTI_ABUSE_ENABLED;
    delete process.env.ANTI_ABUSE_ENFORCEMENT_ENABLED;
    setAntiAbuseOverrides({});
  });

  it(
    "flag OFF = no abuse codes on Signal (S23 path unchanged)",
    async () => {
      process.env.ANTI_ABUSE_ENABLED = "false";
      const clock = new FakeClock(new Date("2026-08-09T18:00:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await seedEligiblePair(server);
      const res = await request(server)
        .post("/signals")
        .set("x-user-id", "a")
        .send({ receiverId: "b", source: "RADAR" })
        .expect(201);
      expect(res.body.signal?.id).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toMatch(/ABUSE_|anti.?abuse/i);
      await app.close();
    },
    30_000,
  );

  it(
    "shadow mode: burst does not block Signal create",
    async () => {
      process.env.ANTI_ABUSE_ENABLED = "true";
      process.env.ANTI_ABUSE_ENFORCEMENT_ENABLED = "false";
      const store = new MemoryAbuseStateStore();
      setAntiAbuseOverrides({
        store,
        engine: new AntiAbuseEngine(store, { ...DEFAULT_POLICY_THRESHOLDS, signalBurstCount: 2 }),
      });
      const clock = new FakeClock(new Date("2026-08-09T18:10:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await seedEligiblePair(server);

      // Stay within free daily quota (billing overrides seed Plus → FREE limit 2)
      for (const target of ["b", "t0"]) {
        await request(server)
          .post("/signals")
          .set("x-user-id", "a")
          .send({ receiverId: target, source: "RADAR" })
          .expect(201);
      }
      expect(store.getSanction("a", clock.now())).toBeUndefined();
      await app.close();
    },
    30_000,
  );

  it(
    "enforcement: Signal cooldown does not break Radar; block noted immediately",
    async () => {
      process.env.ANTI_ABUSE_ENABLED = "true";
      process.env.ANTI_ABUSE_ENFORCEMENT_ENABLED = "true";
      const store = new MemoryAbuseStateStore();
      setAntiAbuseOverrides({
        store,
        engine: new AntiAbuseEngine(store, {
          ...DEFAULT_POLICY_THRESHOLDS,
          signalBurstCount: 2,
          cooldownMs: 60 * 60_000,
        }),
      });
      const clock = new FakeClock(new Date("2026-08-09T18:20:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await seedEligiblePair(server);

      for (const target of ["b", "t0"]) {
        await request(server)
          .post("/signals")
          .set("x-user-id", "a")
          .send({ receiverId: target, source: "RADAR" })
          .expect(201);
      }

      const blocked = await request(server)
        .post("/signals")
        .set("x-user-id", "a")
        .send({ receiverId: "t1", source: "RADAR" })
        .expect(429);
      expect(blocked.body.error?.code).toBe("ABUSE_COOLDOWN");
      expect(JSON.stringify(blocked.body)).not.toMatch(/signal_burst|lat|lng/);

      // Radar still works under SIGNAL_CREATE cooldown
      await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200);

      // Real block is observed immediately on target
      await request(server).post("/safety/block").set("x-user-id", "b").send({ userId: "a" }).expect(201);
      const events = store.listEvents("a", new Date(0), clock.now());
      expect(events.some((e) => e.kind === "safety.block_received")).toBe(true);

      await app.close();
    },
    30_000,
  );

  it(
    "shared store: second Nest instance sees same cooldown",
    async () => {
      process.env.ANTI_ABUSE_ENABLED = "true";
      process.env.ANTI_ABUSE_ENFORCEMENT_ENABLED = "true";
      const shared = new MemoryAbuseStateStore();
      const abuseEngine = new AntiAbuseEngine(shared, {
        ...DEFAULT_POLICY_THRESHOLDS,
        signalBurstCount: 2,
        cooldownMs: 60 * 60_000,
      });
      setAntiAbuseOverrides({ store: shared, engine: abuseEngine });

      const clock = new FakeClock(new Date("2026-08-09T18:30:00.000Z"));
      const engineA = new WingmanEngine({ clock });
      const appA = await createNestApp({
        engine: engineA,
        ephemeral: new MemoryEphemeralStore(),
        skipHydrate: true,
      });
      const serverA = appA.getHttpServer();
      await seedEligiblePair(serverA);
      for (const target of ["b", "t0"]) {
        await request(serverA)
          .post("/signals")
          .set("x-user-id", "a")
          .send({ receiverId: target, source: "RADAR" })
          .expect(201);
      }
      await appA.close();

      // New Nest process, same abuse store
      setAntiAbuseOverrides({ store: shared, engine: abuseEngine });
      const engineB = new WingmanEngine({ clock });
      const appB = await createNestApp({
        engine: engineB,
        ephemeral: new MemoryEphemeralStore(),
        skipHydrate: true,
      });
      const serverB = appB.getHttpServer();
      await seedEligiblePair(serverB);
      const res = await request(serverB)
        .post("/signals")
        .set("x-user-id", "a")
        .send({ receiverId: "t1", source: "RADAR" })
        .expect(429);
      expect(res.body.error?.code).toBe("ABUSE_COOLDOWN");
      await appB.close();
    },
    30_000,
  );
});

describe("S24 architecture: domain never imports anti-abuse", () => {
  it("packages/domain has no @wingman/anti-abuse", () => {
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
      expect(readFileSync(file, "utf8")).not.toMatch(/@wingman\/anti-abuse/);
    }
  });
});

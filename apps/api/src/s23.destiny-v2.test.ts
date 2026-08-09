import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryContextInputStore } from "@wingman/context-engine";
import { createNestApp } from "./testing/create-nest-app.js";
import { setContextEngineOverrides } from "./modules/context/context.module.js";
import { setDestinyV2Overrides } from "./modules/destiny/destiny.module.js";
import { MemoryDestinyProposalStore } from "@wingman/destiny-v2";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("S23 Destiny V2 Nest gates", () => {
  // Cold Nest compile can exceed default 5s on first case in the file.
  const nestTimeout = 30_000;

  afterEach(() => {
    delete process.env.DESTINY_V2_ENABLED;
    delete process.env.DESTINY_V2_PROPOSALS_ENABLED;
    delete process.env.DESTINY_V2_RARITY_PERCENT;
    delete process.env.DESTINY_V2_MIN_SCORE;
    delete process.env.CONTEXT_ENGINE_ENABLED;
    delete process.env.DESTINY_ENABLED;
    setContextEngineOverrides({});
    setDestinyV2Overrides({});
  });

  it(
    "flag OFF = Destiny V1 prompt path (no V2 proposal fields)",
    async () => {
    process.env.DESTINY_ENABLED = "true";
    process.env.DESTINY_V2_ENABLED = "false";
    const clock = new FakeClock(new Date("2026-08-09T16:00:00.000Z"));
    const engine = new WingmanEngine({ clock, destinyEnabled: true });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      skipHydrate: true,
    });
    const server = app.getHttpServer();
    await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
    engine.grantConsent("a", "DESTINY_CONNECTION", "v1");
    engine.grantConsent("b", "DESTINY_CONNECTION", "v1");

    const res = await request(server)
      .post("/destiny/copresence")
      .set("x-user-id", "a")
      .send({ otherUserId: "b" })
      .expect(201);
    expect(res.body.promptEmitted).toBe(true);
    expect(res.body.proposal).toBeUndefined();
    expect(res.body.shadow).toBeUndefined();
    await app.close();
  },
    nestTimeout,
  );

  it("shadow mode: computes without user-visible proposal", async () => {
    process.env.DESTINY_V2_ENABLED = "true";
    process.env.DESTINY_V2_PROPOSALS_ENABLED = "false";
    process.env.DESTINY_V2_RARITY_PERCENT = "100";
    process.env.DESTINY_V2_MIN_SCORE = "0.5";
    process.env.CONTEXT_ENGINE_ENABLED = "true";
    const store = new MemoryContextInputStore();
    store.upsert({ userId: "a", languages: ["fr"], freshnessConfidence: 0.9, availabilityMinutes: 40, intention: "social", mood: "open" });
    store.upsert({ userId: "b", languages: ["fr"], freshnessConfidence: 0.9, availabilityMinutes: 40, intention: "social", mood: "open" });
    setContextEngineOverrides({ store });

    const clock = new FakeClock(new Date("2026-08-09T16:10:00.000Z"));
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

    const res = await request(server)
      .post("/destiny/copresence")
      .set("x-user-id", "a")
      .send({ otherUserId: "b" })
      .expect(201);
    expect(res.body.shadow).toBe(true);
    expect(res.body.proposal).toBeUndefined();
    expect(res.body.promptEmitted).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/score|reasons|strong_context/);

    const list = await request(server).get("/destiny/proposals").set("x-user-id", "a").expect(200);
    expect(list.body.proposals).toEqual([]);
    await app.close();
  });

  it("proposals: double consent → V1 connection; no auto-match; private fields absent", async () => {
    process.env.DESTINY_V2_ENABLED = "true";
    process.env.DESTINY_V2_PROPOSALS_ENABLED = "true";
    process.env.DESTINY_V2_RARITY_PERCENT = "100";
    process.env.DESTINY_V2_MIN_SCORE = "0.5";
    process.env.CONTEXT_ENGINE_ENABLED = "true";
    const ctx = new MemoryContextInputStore();
    ctx.upsert({ userId: "a", languages: ["fr"], availabilityMinutes: 40, intention: "social", mood: "open" });
    ctx.upsert({ userId: "b", languages: ["fr"], availabilityMinutes: 40, intention: "social", mood: "open" });
    setContextEngineOverrides({ store: ctx });
    setDestinyV2Overrides({ store: new MemoryDestinyProposalStore() });

    const clock = new FakeClock(new Date("2026-08-09T16:20:00.000Z"));
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

    const co = await request(server)
      .post("/destiny/copresence")
      .set("x-user-id", "a")
      .send({ otherUserId: "b" })
      .expect(201);
    expect(co.body.proposal?.proposalId).toBeTruthy();
    expect(JSON.stringify(co.body)).not.toMatch(/"score"|reasons|lat|lng|21 m/);
    const proposalId = co.body.proposal.proposalId as string;

    // Single accept ≠ connection
    const one = await request(server)
      .post(`/destiny/proposals/${proposalId}/accept`)
      .set("x-user-id", "a")
      .expect(201);
    expect(one.body.connection).toBeNull();
    expect(engine.connections.size).toBe(0);

    const two = await request(server)
      .post(`/destiny/proposals/${proposalId}/accept`)
      .set("x-user-id", "b")
      .expect(201);
    expect(two.body.connection?.id).toBeTruthy();
    expect(engine.connections.size).toBe(1);
    const signal = [...engine.signals.values()].find((s) => s.source === "DESTINY");
    expect(signal).toBeTruthy();

    await app.close();
  });

  it("ineligible V1 pair never gets a Destiny proposal", async () => {
    process.env.DESTINY_V2_ENABLED = "true";
    process.env.DESTINY_V2_PROPOSALS_ENABLED = "true";
    process.env.DESTINY_V2_RARITY_PERCENT = "100";
    process.env.DESTINY_V2_MIN_SCORE = "0.01";
    setDestinyV2Overrides({ store: new MemoryDestinyProposalStore() });

    const clock = new FakeClock(new Date("2026-08-09T16:30:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();
    // Same gender interests → not mutual radar eligible
    await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["MEN"] }).expect(201);
    await request(server).post("/dev/seed").send({ id: "b", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
    await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);

    const res = await request(server)
      .post("/destiny/copresence")
      .set("x-user-id", "a")
      .send({ otherUserId: "b" })
      .expect(201);
    expect(res.body.proposal).toBeUndefined();
    await app.close();
  });

  it("block invalidates open Destiny proposal", async () => {
    process.env.DESTINY_V2_ENABLED = "true";
    process.env.DESTINY_V2_PROPOSALS_ENABLED = "true";
    process.env.DESTINY_V2_RARITY_PERCENT = "100";
    process.env.DESTINY_V2_MIN_SCORE = "0.5";
    process.env.CONTEXT_ENGINE_ENABLED = "true";
    const ctx = new MemoryContextInputStore();
    ctx.upsert({ userId: "a", languages: ["fr"], availabilityMinutes: 40, intention: "social", mood: "open" });
    ctx.upsert({ userId: "b", languages: ["fr"], availabilityMinutes: 40, intention: "social", mood: "open" });
    setContextEngineOverrides({ store: ctx });
    setDestinyV2Overrides({ store: new MemoryDestinyProposalStore() });

    const clock = new FakeClock(new Date("2026-08-09T16:40:00.000Z"));
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
    const co = await request(server)
      .post("/destiny/copresence")
      .set("x-user-id", "a")
      .send({ otherUserId: "b" })
      .expect(201);
    const proposalId = co.body.proposal.proposalId as string;

    await request(server).post("/safety/block").set("x-user-id", "a").send({ userId: "b" }).expect(201);
    const accept = await request(server)
      .post(`/destiny/proposals/${proposalId}/accept`)
      .set("x-user-id", "a")
      .expect(201);
    expect(accept.body.ok).toBe(false);
    await app.close();
  });
});

describe("S23 architecture: domain never imports destiny-v2", () => {
  it("packages/domain has no @wingman/destiny-v2", () => {
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
      expect(readFileSync(file, "utf8")).not.toMatch(/@wingman\/destiny-v2/);
    }
  });
});

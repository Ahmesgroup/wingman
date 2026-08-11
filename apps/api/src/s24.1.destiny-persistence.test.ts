import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryContextInputStore } from "@wingman/context-engine";
import { MemoryDestinyProposalStore } from "@wingman/destiny-v2";
import { createNestApp } from "./testing/create-nest-app.js";
import { setContextEngineOverrides } from "./modules/context/context.module.js";
import { setDestinyV2Overrides } from "./modules/destiny/destiny.module.js";

describe("S24.1 Destiny proposal persistence", () => {
  const nestTimeout = 30_000;

  afterEach(() => {
    delete process.env.DESTINY_V2_ENABLED;
    delete process.env.DESTINY_V2_PROPOSALS_ENABLED;
    delete process.env.DESTINY_V2_RARITY_PERCENT;
    delete process.env.DESTINY_V2_MIN_SCORE;
    delete process.env.CONTEXT_ENGINE_ENABLED;
    setContextEngineOverrides({});
    setDestinyV2Overrides({});
  });

  it(
    "shared store: second Nest instance sees consent from the first",
    async () => {
      process.env.DESTINY_V2_ENABLED = "true";
      process.env.DESTINY_V2_PROPOSALS_ENABLED = "true";
      process.env.DESTINY_V2_RARITY_PERCENT = "100";
      process.env.DESTINY_V2_MIN_SCORE = "0.5";
      process.env.CONTEXT_ENGINE_ENABLED = "true";

      const shared = new MemoryDestinyProposalStore();
      setDestinyV2Overrides({ store: shared });
      const ctx = new MemoryContextInputStore();
      ctx.upsert({
        userId: "a",
        languages: ["fr"],
        freshnessConfidence: 0.9,
        availabilityMinutes: 40,
        intention: "social",
        mood: "open",
      });
      ctx.upsert({
        userId: "b",
        languages: ["fr"],
        freshnessConfidence: 0.9,
        availabilityMinutes: 40,
        intention: "social",
        mood: "open",
      });
      setContextEngineOverrides({ store: ctx });

      const ephemeral = new MemoryEphemeralStore();
      const clock = new FakeClock(new Date("2026-08-11T19:00:00.000Z"));
      const engine = new WingmanEngine({ clock });

      const app1 = await createNestApp({ engine, ephemeral, skipHydrate: true });
      const s1 = app1.getHttpServer();

      await request(s1)
        .post("/dev/seed")
        .send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"], wingmanPlus: true })
        .expect(201);
      await request(s1)
        .post("/dev/seed")
        .send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"], wingmanPlus: true })
        .expect(201);
      await request(s1).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
      await request(s1).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);

      const created = await request(s1)
        .post("/destiny/copresence")
        .set("x-user-id", "a")
        .send({ otherUserId: "b" })
        .expect(201);
      expect(created.body.proposal?.proposalId).toBeTruthy();
      const proposalId = created.body.proposal.proposalId as string;

      await request(s1).post(`/destiny/proposals/${proposalId}/accept`).set("x-user-id", "a").expect(201);

      // Second Nest process shares the same proposal store (multi-instance simulation)
      setDestinyV2Overrides({ store: shared });
      setContextEngineOverrides({ store: ctx });
      const app2 = await createNestApp({ engine, ephemeral, skipHydrate: true });
      const s2 = app2.getHttpServer();

      const listed = await request(s2).get("/destiny/proposals").set("x-user-id", "b").expect(200);
      expect(listed.body.proposals.some((p: { proposalId: string; status: string }) => p.proposalId === proposalId && p.status === "A_ACCEPTED")).toBe(
        true,
      );

      const mutual = await request(s2)
        .post(`/destiny/proposals/${proposalId}/accept`)
        .set("x-user-id", "b")
        .expect(201);
      expect(mutual.body.ok).toBe(true);
      expect(mutual.body.proposal.status).toBe("MUTUAL");
      expect(mutual.body.connection?.id).toBeTruthy();

      await app1.close();
      await app2.close();
    },
    nestTimeout,
  );

  it(
    "flag OFF still ignores destiny proposal store",
    async () => {
      process.env.DESTINY_V2_ENABLED = "false";
      const shared = new MemoryDestinyProposalStore();
      setDestinyV2Overrides({ store: shared });
      const clock = new FakeClock(new Date("2026-08-11T19:10:00.000Z"));
      const engine = new WingmanEngine({ clock, destinyEnabled: true });
      process.env.DESTINY_ENABLED = "true";
      const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
      const server = app.getHttpServer();
      await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
      const res = await request(server)
        .post("/destiny/copresence")
        .set("x-user-id", "a")
        .send({ otherUserId: "b" })
        .expect(201);
      expect(res.body.proposal).toBeUndefined();
      expect((await shared.listAll()).length).toBe(0);
      await app.close();
      delete process.env.DESTINY_ENABLED;
    },
    nestTimeout,
  );
});

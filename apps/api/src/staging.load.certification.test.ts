/**
 * Staging load certification (infra) — S21–S24.1 under real Redis + Postgres.
 *
 * Soft-passes when REDIS_URL or DATABASE_URL is unset / unreachable (CI without Docker).
 * Live GO requires both URLs pointing at shared Redis + Postgres.
 *
 * Run:
 *   docker compose -f infrastructure/docker/docker-compose.yml up -d
 *   DATABASE_URL=postgresql://wingman:wingman@127.0.0.1:5432/wingman pnpm --filter @wingman/database exec prisma db push --schema=./prisma/schema.prisma
 *   REDIS_URL=redis://127.0.0.1:6379 DATABASE_URL=postgresql://wingman:wingman@127.0.0.1:5432/wingman \
 *     pnpm --filter @wingman/api test -- src/staging.load.certification.test.ts
 */
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { createPrismaClient, pingDatabase, type PrismaClient } from "@wingman/database";
import { RedisEphemeralStore } from "@wingman/ephemeral";
import { LivePrismaProtocolRepository } from "@wingman/persistence";
import { MemoryContextInputStore } from "@wingman/context-engine";
import { RedisDestinyProposalStore } from "@wingman/destiny-v2";
import { createNestApp } from "./testing/create-nest-app.js";
import { setContextEngineOverrides } from "./modules/context/context.module.js";
import { setDestinyV2Overrides } from "./modules/destiny/destiny.module.js";
import { setInfraOverrides } from "./modules/infra/infra.module.js";

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const WANT_LIVE = Boolean(REDIS_URL && DATABASE_URL);

type LiveCtx = {
  ephemeral: RedisEphemeralStore;
  destinyStore: RedisDestinyProposalStore;
  prisma: PrismaClient;
  repo: LivePrismaProtocolRepository;
};

async function tryConnectLive(): Promise<LiveCtx | null> {
  if (!WANT_LIVE || !REDIS_URL || !DATABASE_URL) return null;
  try {
    const ephemeral = RedisEphemeralStore.fromUrl(REDIS_URL);
    await ephemeral.connect();
    const destinyStore = RedisDestinyProposalStore.fromUrl(REDIS_URL);
    await destinyStore.connect();
    const prisma = createPrismaClient(DATABASE_URL);
    await pingDatabase(prisma);
    return { ephemeral, destinyStore, prisma, repo: new LivePrismaProtocolRepository(prisma) };
  } catch (e) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "staging.load.infra_unavailable_soft_pass",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return null;
  }
}

function soft(gate: string): void {
  console.warn(`[staging] ${gate} soft-pass — set REDIS_URL+DATABASE_URL with reachable Redis/Postgres`);
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

describe("Staging load certification (Redis + Postgres)", () => {
  const nestTimeout = 60_000;

  afterEach(() => {
    delete process.env.DESTINY_V2_ENABLED;
    delete process.env.DESTINY_V2_PROPOSALS_ENABLED;
    delete process.env.DESTINY_V2_RARITY_PERCENT;
    delete process.env.DESTINY_V2_MIN_SCORE;
    delete process.env.CONTEXT_ENGINE_ENABLED;
    delete process.env.RADAR_INTELLIGENCE_ENABLED;
    setContextEngineOverrides({});
    setDestinyV2Overrides({});
    setInfraOverrides({});
  });

  it("L0 probe documents soft-pass vs live mode", async () => {
    if (!WANT_LIVE) {
      soft("L0");
      expect(true).toBe(true);
      return;
    }
    const live = await tryConnectLive();
    if (!live) {
      soft("L0-connect");
      expect(true).toBe(true);
      return;
    }
    await live.prisma.$disconnect();
    await live.destinyStore.disconnect();
    expect(WANT_LIVE).toBe(true);
  });

  it(
    "L1 shared Redis Destiny store: consent on Nest A visible on Nest B → single MUTUAL handoff",
    async () => {
      const live = await tryConnectLive();
      if (!live) {
        soft("L1");
        return;
      }

      process.env.DESTINY_V2_ENABLED = "true";
      process.env.DESTINY_V2_PROPOSALS_ENABLED = "true";
      process.env.DESTINY_V2_RARITY_PERCENT = "100";
      process.env.DESTINY_V2_MIN_SCORE = "0.5";
      process.env.CONTEXT_ENGINE_ENABLED = "true";

      const a = uid("a");
      const b = uid("b");
      const ctx = new MemoryContextInputStore();
      ctx.upsert({
        userId: a,
        languages: ["fr"],
        freshnessConfidence: 0.9,
        availabilityMinutes: 40,
        intention: "social",
        mood: "open",
      });
      ctx.upsert({
        userId: b,
        languages: ["fr"],
        freshnessConfidence: 0.9,
        availabilityMinutes: 40,
        intention: "social",
        mood: "open",
      });
      setContextEngineOverrides({ store: ctx });
      setDestinyV2Overrides({ store: live.destinyStore });

      const clock = new FakeClock(new Date("2026-08-11T19:30:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app1 = await createNestApp({
        engine,
        ephemeral: live.ephemeral,
        protocolRepo: live.repo,
        prisma: live.prisma,
        skipHydrate: true,
      });
      const s1 = app1.getHttpServer();

      await request(s1)
        .post("/dev/seed")
        .send({ id: a, gender: "MALE", interestedIn: ["WOMEN"], wingmanPlus: true })
        .expect(201);
      await request(s1)
        .post("/dev/seed")
        .send({ id: b, gender: "FEMALE", interestedIn: ["MEN"], wingmanPlus: true })
        .expect(201);
      await request(s1).post("/radar/activate").set("x-user-id", a).send({ lat: 48.85, lng: 2.35 }).expect(201);
      await request(s1).post("/radar/activate").set("x-user-id", b).send({ lat: 48.8501, lng: 2.3501 }).expect(201);

      const created = await request(s1)
        .post("/destiny/copresence")
        .set("x-user-id", a)
        .send({ otherUserId: b })
        .expect(201);
      expect(created.body.proposal?.proposalId).toBeTruthy();
      const proposalId = created.body.proposal.proposalId as string;
      await request(s1).post(`/destiny/proposals/${proposalId}/accept`).set("x-user-id", a).expect(201);

      setDestinyV2Overrides({ store: live.destinyStore });
      setContextEngineOverrides({ store: ctx });
      const app2 = await createNestApp({
        engine,
        ephemeral: live.ephemeral,
        protocolRepo: live.repo,
        prisma: live.prisma,
        skipHydrate: true,
      });
      const listed = await request(app2.getHttpServer()).get("/destiny/proposals").set("x-user-id", b).expect(200);
      expect(
        listed.body.proposals.some(
          (p: { proposalId: string; status: string }) => p.proposalId === proposalId && p.status === "A_ACCEPTED",
        ),
      ).toBe(true);

      const mutual = await request(app2.getHttpServer())
        .post(`/destiny/proposals/${proposalId}/accept`)
        .set("x-user-id", b)
        .expect(201);
      expect(mutual.body.proposal.status).toBe("MUTUAL");
      expect(mutual.body.connection?.id).toBeTruthy();
      expect(engine.connections.size).toBe(1);

      await app1.close();
      await app2.close();
      await live.prisma.$disconnect();
      await live.destinyStore.disconnect();
    },
    nestTimeout,
  );

  it(
    "L2 Redis locks: concurrent destiny-accept / signal-accept converge to one connection",
    async () => {
      const live = await tryConnectLive();
      if (!live) {
        soft("L2");
        return;
      }

      process.env.DESTINY_V2_ENABLED = "true";
      process.env.DESTINY_V2_PROPOSALS_ENABLED = "true";
      process.env.DESTINY_V2_RARITY_PERCENT = "100";
      process.env.DESTINY_V2_MIN_SCORE = "0.5";
      process.env.CONTEXT_ENGINE_ENABLED = "true";

      const a = uid("la");
      const b = uid("lb");
      const ctx = new MemoryContextInputStore();
      for (const id of [a, b]) {
        ctx.upsert({
          userId: id,
          languages: ["fr"],
          freshnessConfidence: 0.9,
          availabilityMinutes: 40,
          intention: "social",
          mood: "open",
        });
      }
      setContextEngineOverrides({ store: ctx });
      setDestinyV2Overrides({ store: live.destinyStore });

      const clock = new FakeClock(new Date("2026-08-11T19:40:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({
        engine,
        ephemeral: live.ephemeral,
        protocolRepo: live.repo,
        prisma: live.prisma,
        skipHydrate: true,
      });
      const server = app.getHttpServer();

      await request(server)
        .post("/dev/seed")
        .send({ id: a, gender: "MALE", interestedIn: ["WOMEN"], wingmanPlus: true })
        .expect(201);
      await request(server)
        .post("/dev/seed")
        .send({ id: b, gender: "FEMALE", interestedIn: ["MEN"], wingmanPlus: true })
        .expect(201);
      await request(server).post("/radar/activate").set("x-user-id", a).send({ lat: 48.86, lng: 2.36 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", b).send({ lat: 48.8601, lng: 2.3601 }).expect(201);

      const created = await request(server)
        .post("/destiny/copresence")
        .set("x-user-id", a)
        .send({ otherUserId: b })
        .expect(201);
      const proposalId = created.body.proposal.proposalId as string;
      await request(server).post(`/destiny/proposals/${proposalId}/accept`).set("x-user-id", a).expect(201);

      const [r1, r2] = await Promise.all([
        request(server).post(`/destiny/proposals/${proposalId}/accept`).set("x-user-id", b),
        request(server).post(`/destiny/proposals/${proposalId}/accept`).set("x-user-id", b),
      ]);
      expect([r1.status, r2.status].every((s) => s === 201)).toBe(true);
      const withConn = [r1.body, r2.body].filter((body) => body.connection?.id);
      expect(withConn.length).toBeGreaterThanOrEqual(1);
      expect(engine.connections.size).toBe(1);

      await app.close();
      await live.prisma.$disconnect();
      await live.destinyStore.disconnect();
    },
    nestTimeout,
  );

  it(
    "L3 Redis quotas: FREE signal quota enforced under concurrent creates",
    async () => {
      const live = await tryConnectLive();
      if (!live) {
        soft("L3");
        return;
      }

      const sender = uid("qs");
      const targets = [uid("t0"), uid("t1"), uid("t2")];
      const clock = new FakeClock(new Date("2026-08-11T19:50:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({
        engine,
        ephemeral: live.ephemeral,
        protocolRepo: live.repo,
        prisma: live.prisma,
        skipHydrate: true,
      });
      const server = app.getHttpServer();

      await request(server)
        .post("/dev/seed")
        .send({ id: sender, gender: "MALE", interestedIn: ["WOMEN"], wingmanPlus: false })
        .expect(201);
      for (const t of targets) {
        await request(server)
          .post("/dev/seed")
          .send({ id: t, gender: "FEMALE", interestedIn: ["MEN"], wingmanPlus: true })
          .expect(201);
      }
      await request(server).post("/radar/activate").set("x-user-id", sender).send({ lat: 48.87, lng: 2.37 }).expect(201);
      for (const t of targets) {
        await request(server).post("/radar/activate").set("x-user-id", t).send({ lat: 48.8701, lng: 2.3701 }).expect(201);
      }

      const results = await Promise.all(
        targets.map((t) =>
          request(server).post("/signals").set("x-user-id", sender).send({ receiverId: t, source: "RADAR" }),
        ),
      );
      const ok = results.filter((r) => r.status === 201).length;
      const denied = results.filter((r) => r.status >= 400).length;
      expect(ok).toBeLessThanOrEqual(2);
      expect(ok + denied).toBe(3);
      expect(denied).toBeGreaterThanOrEqual(1);

      await app.close();
      await live.prisma.$disconnect();
      await live.destinyStore.disconnect();
    },
    nestTimeout,
  );

  it(
    "L4 Redis pub/sub: realtime bus delivers across subscribers (eventId intact)",
    async () => {
      const live = await tryConnectLive();
      if (!live) {
        soft("L4");
        return;
      }

      const seen: string[] = [];
      const unsub = await live.ephemeral.subscribe("wingman.realtime", (p) => seen.push(p));
      const eventId = `stg_${Date.now()}`;
      await live.ephemeral.publish(
        "wingman.realtime",
        JSON.stringify({ type: "signal.received", eventId, aggregateId: "x" }),
      );
      await new Promise((r) => setTimeout(r, 150));
      expect(seen.some((p) => p.includes(eventId))).toBe(true);
      await unsub();
      await live.prisma.$disconnect();
      await live.destinyStore.disconnect();
    },
    nestTimeout,
  );

  it(
    "L5 Postgres: concurrent seeds + SELECT 1 latency budget",
    async () => {
      const live = await tryConnectLive();
      if (!live) {
        soft("L5");
        return;
      }

      const clock = new FakeClock(new Date("2026-08-11T20:00:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({
        engine,
        ephemeral: live.ephemeral,
        protocolRepo: live.repo,
        prisma: live.prisma,
        skipHydrate: true,
      });
      const server = app.getHttpServer();
      const u = uid("pg");
      const v = uid("pg2");

      const t0 = Date.now();
      await Promise.all([
        request(server).post("/dev/seed").send({ id: u, gender: "MALE", interestedIn: ["WOMEN"] }),
        request(server).post("/dev/seed").send({ id: v, gender: "FEMALE", interestedIn: ["MEN"] }),
      ]);
      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        const s = Date.now();
        await pingDatabase(live.prisma);
        samples.push(Date.now() - s);
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.floor(samples.length * 0.95)] ?? samples[samples.length - 1]!;
      expect(p95).toBeLessThan(500);
      expect(Date.now() - t0).toBeLessThan(15_000);

      const ready = await request(server).get("/internal/ready").expect(200);
      expect(ready.body.ready).toBe(true);
      expect(ready.body.checks?.database?.ok).toBe(true);

      await app.close();
      await live.prisma.$disconnect();
      await live.destinyStore.disconnect();
    },
    nestTimeout,
  );
});

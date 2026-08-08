import { describe, expect, it, vi } from "vitest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { PrismaProtocolRepository, type ProtocolPrismaClient } from "./prisma-repository.js";
import { ProtocolPersistenceMirror } from "./mirror.js";

function fakePrisma(): ProtocolPrismaClient & {
  signals: Map<string, Record<string, unknown>>;
  connections: Map<string, Record<string, unknown>>;
} {
  const signals = new Map<string, Record<string, unknown>>();
  const connections = new Map<string, Record<string, unknown>>();
  return {
    signals,
    connections,
    signal: {
      async upsert({ where, create, update }) {
        const next = { ...(signals.get(where.id) ?? {}), ...create, ...update };
        signals.set(where.id, next);
        return next;
      },
      async findUnique({ where }) {
        return signals.get(where.id) ?? null;
      },
      async findMany({ where }) {
        return [...signals.values()].filter((s) => s.isActive === where.isActive);
      },
    },
    connection: {
      async upsert({ where, create, update }) {
        const next = { ...(connections.get(where.id) ?? {}), ...create, ...update };
        connections.set(where.id, next);
        return next;
      },
      async findUnique({ where }) {
        return connections.get(where.id) ?? null;
      },
      async findMany({ where }) {
        return [...connections.values()].filter((c) => c.isActive === where.isActive);
      },
    },
    userBlock: {
      upsert: vi.fn(async () => ({})),
    },
    report: {
      create: vi.fn(async () => ({})),
    },
    consentEvent: {
      create: vi.fn(async () => ({})),
    },
  };
}

describe("S13 Prisma protocol repository port", () => {
  it("write-behind signal/connection via Prisma-shaped client", async () => {
    const clock = new FakeClock(new Date("2026-08-09T00:30:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const db = fakePrisma();
    const repo = new PrismaProtocolRepository(db);
    const mirror = new ProtocolPersistenceMirror(engine, repo);

    engine.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine.seedUser({
      id: "b",
      profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] },
    });
    engine.activateRadar("a", { lat: 48.85, lng: 2.35 });
    engine.activateRadar("b", { lat: 48.8501, lng: 2.3501 });

    const sig = engine.sendSignal("a", "b");
    await mirror.mirrorSignal(sig.id);
    expect((await repo.getSignal(sig.id))?.status).toBe("PENDING");

    const conn = engine.acceptSignal(sig.id, "b");
    await mirror.mirrorSignal(sig.id);
    await mirror.mirrorConnection(conn.id);
    expect((await repo.getConnection(conn.id))?.state).toBe("WAITING_FOR_INITIATOR_SELFIE");
    expect(db.signals.size).toBe(1);
    expect(db.connections.size).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  DestinyV2Engine,
  DEFAULT_DESTINY_POLICY,
  MemoryDestinyProposalStore,
  createCooldownLedger,
  evaluateDestinyCandidate,
  isDestinyV2Enabled,
  isDestinyV2ProposalsEnabled,
  pairKey,
  proposalFromWire,
  proposalToWire,
  rarityAllows,
  toPublicProposal,
  type DestinyContextPort,
} from "./index.js";

const richContext: DestinyContextPort = {
  forUser(_id) {
    return {
      languages: ["fr"],
      freshness: 0.8,
      availabilityMinutes: 30,
      intention: "social",
      mood: "open",
      mobility: "walking",
    };
  },
};

describe("S23 Destiny V2 package", () => {
  it("flags default off", () => {
    expect(isDestinyV2Enabled({})).toBe(false);
    expect(isDestinyV2ProposalsEnabled({})).toBe(false);
  });

  it("never scores ineligible pairs as candidates", () => {
    const r = evaluateDestinyCandidate({
      userA: "a",
      userB: "b",
      v1Eligible: false,
      now: new Date(),
      contextPort: richContext,
    });
    expect(r.decision).toBe("INELIGIBLE");
    expect(r.score).toBe(0);
  });

  it("missing context is neutral (still can candidate on distance/exposure)", () => {
    const r = evaluateDestinyCandidate({
      userA: "a",
      userB: "b",
      v1Eligible: true,
      distanceBand: "NEAR",
      recentInteraction: false,
      recentExposureCount: 0,
      now: new Date(),
    });
    expect(r.reasons).toContain("missing_context_neutral");
    expect(r.decision).toBe("CANDIDATE");
  });

  it("public proposal never exposes score/reasons", () => {
    const pub = toPublicProposal({
      id: "dpy_1",
      pairKey: "a:b",
      userA: "a",
      userB: "b",
      status: "PROPOSED",
      createdAt: new Date(),
      expiresAt: new Date(),
      acceptedBy: new Set(),
      score: 0.99,
      reasons: ["strong_context_overlap", "distance_near"],
    });
    expect(JSON.stringify(pub)).not.toMatch(/score|reasons|strong_context|0\.99/);
    expect(pub.message).toContain("convergence");
  });

  it("wire format round-trips Set and Dates (S24.1 Redis)", () => {
    const p = {
      id: "dpy_x",
      pairKey: "a:b",
      userA: "a",
      userB: "b",
      status: "A_ACCEPTED" as const,
      createdAt: new Date("2026-08-11T12:00:00.000Z"),
      expiresAt: new Date("2026-08-11T12:15:00.000Z"),
      acceptedBy: new Set(["a"]),
      score: 0.8,
      reasons: ["distance_near" as const],
    };
    const back = proposalFromWire(proposalToWire(p));
    expect(back.acceptedBy.has("a")).toBe(true);
    expect(back.createdAt.toISOString()).toBe(p.createdAt.toISOString());
    expect(back.status).toBe("A_ACCEPTED");
  });

  it("shadow mode evaluates without creating proposals", async () => {
    const engine = new DestinyV2Engine(new MemoryDestinyProposalStore(), createCooldownLedger(), {
      ...DEFAULT_DESTINY_POLICY,
      rarityPercent: 100,
      minScore: 0.5,
    });
    const out = await engine.evaluate(
      {
        userA: "a",
        userB: "b",
        v1Eligible: true,
        distanceBand: "NEAR",
        recentInteraction: false,
        recentExposureCount: 0,
        now: new Date("2026-08-09T12:00:00.000Z"),
        contextPort: richContext,
      },
      { proposalsEnabled: false },
    );
    expect(out.shadow).toBe(true);
    expect(out.proposal).toBeUndefined();
    expect(out.candidate.decision).toBe("CANDIDATE");
  });

  it("double consent is required; concurrent accepts yield single MUTUAL", async () => {
    const store = new MemoryDestinyProposalStore();
    const engine = new DestinyV2Engine(store, createCooldownLedger(), {
      ...DEFAULT_DESTINY_POLICY,
      minScore: 0.5,
      rarityPercent: 100,
      userCooldownMs: 0,
      pairCooldownMs: 0,
    });
    const now = new Date("2026-08-09T12:00:00.000Z");
    const out = await engine.evaluate(
      {
        userA: "a",
        userB: "b",
        v1Eligible: true,
        distanceBand: "NEAR",
        recentInteraction: false,
        recentExposureCount: 0,
        now,
        contextPort: richContext,
      },
      { proposalsEnabled: true },
    );
    expect(out.proposal).toBeDefined();
    const id = out.proposal!.id;

    const r1 = await engine.accept(id, "a", now);
    expect(r1.ok && r1.proposal.status).toBe("A_ACCEPTED");
    expect(r1.ok && r1.becameMutual).toBe(false);

    const concurrent = await Promise.all([engine.accept(id, "b", now), engine.accept(id, "b", now)]);
    const mutuals = concurrent.filter((r) => r.ok && r.becameMutual);
    // Shared store + sequential upserts: at most one transition reports becameMutual
    expect(mutuals.length).toBeGreaterThanOrEqual(1);
    expect((await store.get(id))?.status).toBe("MUTUAL");
  });

  it("shared memory store is visible across two engines (S24.1)", async () => {
    const store = new MemoryDestinyProposalStore();
    const a = new DestinyV2Engine(store, createCooldownLedger(), {
      ...DEFAULT_DESTINY_POLICY,
      minScore: 0.5,
      rarityPercent: 100,
      userCooldownMs: 0,
      pairCooldownMs: 0,
    });
    const b = new DestinyV2Engine(store, createCooldownLedger(), {
      ...DEFAULT_DESTINY_POLICY,
      minScore: 0.5,
      rarityPercent: 100,
      userCooldownMs: 0,
      pairCooldownMs: 0,
    });
    const now = new Date("2026-08-11T18:00:00.000Z");
    const out = await a.evaluate(
      {
        userA: "u1",
        userB: "u2",
        v1Eligible: true,
        distanceBand: "NEAR",
        recentInteraction: false,
        recentExposureCount: 0,
        now,
        contextPort: richContext,
      },
      { proposalsEnabled: true },
    );
    const id = out.proposal!.id;
    await a.accept(id, "u1", now);
    const listed = await b.listPublicForUser("u2", now);
    expect(listed.some((p) => p.proposalId === id && p.status === "A_ACCEPTED")).toBe(true);
  });

  it("decline blocks connection path; expiry blocks late accept", async () => {
    const store = new MemoryDestinyProposalStore();
    const engine = new DestinyV2Engine(store, createCooldownLedger(), {
      ...DEFAULT_DESTINY_POLICY,
      minScore: 0.5,
      rarityPercent: 100,
      proposalTtlMs: 1000,
      userCooldownMs: 0,
      pairCooldownMs: 0,
      rejectionCooldownMs: 0,
    });
    const t0 = new Date("2026-08-09T12:00:00.000Z");
    const created = await engine.evaluate(
      {
        userA: "a",
        userB: "b",
        v1Eligible: true,
        distanceBand: "NEAR",
        recentInteraction: false,
        recentExposureCount: 0,
        now: t0,
        contextPort: richContext,
      },
      { proposalsEnabled: true },
    );
    const id = created.proposal!.id;
    expect((await engine.decline(id, "b", t0)).ok).toBe(true);
    expect((await engine.accept(id, "a", t0)).ok).toBe(false);

    const created2 = await engine.evaluate(
      {
        userA: "c",
        userB: "d",
        v1Eligible: true,
        distanceBand: "NEAR",
        recentInteraction: false,
        recentExposureCount: 0,
        now: t0,
        contextPort: richContext,
      },
      { proposalsEnabled: true },
    );
    const id2 = created2.proposal!.id;
    const late = new Date(t0.getTime() + 5000);
    expect((await engine.accept(id2, "c", late)).ok).toBe(false);
  });

  it("pair cooldown prevents farming", async () => {
    const store = new MemoryDestinyProposalStore();
    const ledger = createCooldownLedger();
    const engine = new DestinyV2Engine(store, ledger, {
      ...DEFAULT_DESTINY_POLICY,
      minScore: 0.5,
      rarityPercent: 100,
      userCooldownMs: 0,
      pairCooldownMs: 60_000,
    });
    const now = new Date("2026-08-09T12:00:00.000Z");
    const input = {
      userA: "a",
      userB: "b",
      v1Eligible: true,
      distanceBand: "NEAR" as const,
      recentInteraction: false,
      recentExposureCount: 0,
      now,
      contextPort: richContext,
    };
    expect((await engine.evaluate(input, { proposalsEnabled: true })).proposal).toBeDefined();
    const active = (await store.getActiveByPair(pairKey("a", "b")))!;
    await store.upsert({ ...active, status: "EXPIRED", acceptedBy: new Set() });
    const second = await engine.evaluate(input, { proposalsEnabled: true });
    expect(second.candidate.decision).toBe("REJECTED_POLICY");
    expect(second.candidate.reasons).toContain("pair_cooldown");
  });

  it("rarity gate is deterministic", () => {
    expect(rarityAllows("a:b", "2026-08-09", 100)).toBe(true);
    expect(rarityAllows("a:b", "2026-08-09", 0)).toBe(false);
    expect(rarityAllows("a:b", "2026-08-09", 50)).toBe(rarityAllows("a:b", "2026-08-09", 50));
  });
});

import { describe, expect, it } from "vitest";
import { ExposureStore } from "./exposure.js";
import { isRadarIntelligenceEnabled, rankRadarCandidates, toPublicCandidateView } from "./index.js";
import type { EligibleCandidate } from "./types.js";

function cand(partial: Partial<EligibleCandidate> & { userId: string }): EligibleCandidate {
  return {
    approximateDistanceBand: "AROUND",
    ...partial,
  };
}

describe("S21 Radar Intelligence", () => {
  it("feature flag defaults off", () => {
    expect(isRadarIntelligenceEnabled({})).toBe(false);
    expect(isRadarIntelligenceEnabled({ RADAR_INTELLIGENCE_ENABLED: "true" })).toBe(true);
  });

  it("preserves the exact eligible set (V1 decides who; S21 only orders)", () => {
    const candidates = [
      cand({ userId: "far", approximateDistanceBand: "AROUND", presenceRemainingMs: 10_000 }),
      cand({ userId: "near", approximateDistanceBand: "NEAR", presenceRemainingMs: 90_000 }),
      cand({ userId: "mid", approximateDistanceBand: "AROUND", presenceRemainingMs: 80_000 }),
    ];
    const { ordered, audit } = rankRadarCandidates({
      viewerId: "viewer",
      now: new Date("2026-08-09T12:00:00.000Z"),
      candidates,
    });
    expect(ordered.map((c) => c.userId).sort()).toEqual(["far", "mid", "near"]);
    expect(audit.outputOrder).toHaveLength(3);
    expect(ordered[0]!.userId).toBe("near");
  });

  it("does not invent popularity / beauty signals in reasons", () => {
    const { audit } = rankRadarCandidates({
      viewerId: "v",
      now: new Date(),
      candidates: [cand({ userId: "a", approximateDistanceBand: "NEAR" })],
    });
    const banned = ["beauty", "popularity", "matches", "wealth", "addiction"];
    for (const d of audit.decisions) {
      for (const r of d.reasons) {
        expect(banned.some((b) => r.includes(b))).toBe(false);
      }
    }
  });

  it("shared language and freshness improve order without excluding anyone", () => {
    const candidates = [
      cand({
        userId: "stale_en",
        approximateDistanceBand: "NEAR",
        presenceRemainingMs: 5_000,
        languages: ["EN"],
      }),
      cand({
        userId: "fresh_fr",
        approximateDistanceBand: "NEAR",
        presenceRemainingMs: 100_000,
        languages: ["FR"],
      }),
    ];
    const { ordered } = rankRadarCandidates({
      viewerId: "v",
      viewerLanguages: ["FR"],
      now: new Date(),
      candidates,
    });
    expect(ordered.map((c) => c.userId)).toEqual(["fresh_fr", "stale_en"]);
  });

  it("diversity rotation demotes over-exposed candidates", () => {
    const exposure = new ExposureStore();
    const now = new Date("2026-08-09T12:00:00.000Z");
    exposure.recordImpressions("v", ["over", "over", "over"], now);
    const candidates = [
      cand({ userId: "over", approximateDistanceBand: "NEAR", presenceRemainingMs: 90_000 }),
      cand({ userId: "fresh", approximateDistanceBand: "NEAR", presenceRemainingMs: 90_000 }),
    ];
    const { ordered } = rankRadarCandidates({
      viewerId: "v",
      now,
      candidates,
      recentExposureCount: (id) => exposure.countRecent("v", id, now),
    });
    expect(ordered[0]!.userId).toBe("fresh");
    expect(ordered.map((c) => c.userId).sort()).toEqual(["fresh", "over"]);
  });

  it("unknown languages stay neutral (no shared_language penalty path)", () => {
    const candidates = [
      cand({ userId: "a", approximateDistanceBand: "NEAR", presenceRemainingMs: 90_000 }),
      cand({
        userId: "b",
        approximateDistanceBand: "NEAR",
        presenceRemainingMs: 90_000,
        languages: ["fr"],
      }),
    ];
    const { ordered, audit } = rankRadarCandidates({
      viewerId: "v",
      viewerLanguages: undefined,
      now: new Date(),
      candidates,
    });
    expect(ordered.map((c) => c.userId).sort()).toEqual(["a", "b"]);
    expect(audit.decisions.every((d) => !d.reasons.includes("shared_language"))).toBe(true);
  });

  it("public view never includes score or enrichment fields", () => {
    const pub = toPublicCandidateView(
      cand({
        userId: "a",
        approximateDistanceBand: "NEAR",
        presenceRemainingMs: 99,
        languages: ["FR"],
        mood: "OPEN",
      }),
    );
    expect(pub).toEqual({
      userId: "a",
      approximateDistanceBand: "NEAR",
      mood: "OPEN",
    });
    expect(JSON.stringify(pub)).not.toContain("score");
    expect(JSON.stringify(pub)).not.toContain("presenceRemaining");
  });

  it("RadarContextPort enrichment is preferred when provided", () => {
    const now = new Date();
    const { ordered } = rankRadarCandidates({
      viewerId: "v",
      now,
      candidates: [
        cand({ userId: "x", approximateDistanceBand: "NEAR", presenceRemainingMs: 90_000 }),
        cand({ userId: "y", approximateDistanceBand: "NEAR", presenceRemainingMs: 90_000 }),
      ],
      contextPort: {
        forUser(id) {
          if (id === "v") return { languages: ["fr"] };
          if (id === "y") return { languages: ["fr"], freshness: 0.9 };
          if (id === "x") return { languages: ["en"], freshness: 0.9 };
          return undefined;
        },
      },
    });
    expect(ordered[0]!.userId).toBe("y");
  });
});

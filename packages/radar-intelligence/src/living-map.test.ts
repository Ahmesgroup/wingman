import { describe, expect, it } from "vitest";
import {
  aggregatePulse,
  bandFromMeters,
  bearingBucketFromDeg,
  bearingDegrees,
  boundOpportunities,
  filterOpportunities,
  isLivingMapEnabled,
  MAX_PUBLIC_OPPORTUNITIES,
  opportunityIdFor,
  payloadLeaksCoordinates,
  PULSE_MIN_THRESHOLD,
  projectOpportunity,
  quietPulse,
  type OpportunityPublic,
} from "./living-map.js";

function opp(partial: Partial<OpportunityPublic> & { userId: string }): OpportunityPublic {
  const band = partial.distanceBand ?? "NEARBY";
  const sector = partial.bearingBucket ?? "N";
  return {
    opportunityId: partial.opportunityId ?? opportunityIdFor("v", partial.userId),
    userId: partial.userId,
    distanceBand: band,
    bearingBucket: sector,
    displayZone: partial.displayZone ?? { ring: band, sector },
    presenceState: partial.presenceState ?? "AVAILABLE",
    moodState: partial.moodState ?? "OPEN",
    contextTags: partial.contextTags ?? [],
    destiny: partial.destiny ?? false,
    ...partial,
  };
}

describe("Living Map privacy projection", () => {
  it("feature flag defaults off", () => {
    expect(isLivingMapEnabled({})).toBe(false);
    expect(isLivingMapEnabled({ WINGMAN_LIVING_MAP_V1: "true" })).toBe(true);
  });

  it("0 candidates → 0 opportunities", () => {
    expect(boundOpportunities([]).opportunities).toEqual([]);
  });

  it("self is never an opportunity (projection is otherId-only)", () => {
    const pub = projectOpportunity({
      viewerId: "a",
      otherId: "b",
      meters: 12,
      bearingDeg: 40,
    });
    expect(pub.userId).toBe("b");
    expect(pub.userId).not.toBe("a");
    expect(payloadLeaksCoordinates(pub)).toBe(false);
  });

  it("never includes exact peer coordinates", () => {
    const pub = projectOpportunity({
      viewerId: "v",
      otherId: "peer",
      meters: 18,
      bearingDeg: 91,
      mood: "OPEN",
      intention: "AVAILABLE_NOW",
      interests: ["Music", "Food"],
      expiresAt: new Date("2026-08-17T18:00:00.000Z"),
    });
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/"lat"/);
    expect(json).not.toMatch(/"lng"/);
    expect(json).not.toMatch(/latitude/i);
    expect(json).not.toMatch(/longitude/i);
    expect(pub.distanceBand).toBe("VERY_CLOSE");
    expect(pub.bearingBucket).toBe("E");
    expect(pub.displayZone).toEqual({ ring: "VERY_CLOSE", sector: "E" });
    expect(pub.moodState).toBe("OPEN");
    expect(pub.contextTags).toEqual(["Music", "Food"]);
  });

  it("maps UNSURE mood to EXPLORING", () => {
    expect(projectOpportunity({
      viewerId: "v",
      otherId: "p",
      meters: 40,
      bearingDeg: 0,
      mood: "UNSURE",
    }).moodState).toBe("EXPLORING");
  });

  it("distance bands: very close / nearby / around me", () => {
    expect(bandFromMeters(10)).toBe("VERY_CLOSE");
    expect(bandFromMeters(40)).toBe("NEARBY");
    expect(bandFromMeters(120)).toBe("AROUND_ME");
    expect(bandFromMeters(250)).toBeUndefined();
  });

  it("bearing buckets are 45° sectors", () => {
    expect(bearingBucketFromDeg(0)).toBe("N");
    expect(bearingBucketFromDeg(45)).toBe("NE");
    expect(bearingBucketFromDeg(90)).toBe("E");
    expect(bearingBucketFromDeg(359)).toBe("N");
  });

  it("bearingDegrees is coarse-input only (not returned)", () => {
    const deg = bearingDegrees({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8576, lng: 2.3532 });
    expect(deg).toBeGreaterThanOrEqual(0);
    expect(deg).toBeLessThan(360);
  });

  it("opportunityId is opaque and stable, not a technical display id", () => {
    const a = opportunityIdFor("v", "peer-1");
    const b = opportunityIdFor("v", "peer-1");
    const c = opportunityIdFor("v", "peer-2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("peer-1");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("filters reduce the authorized set and never add ids", () => {
    const set = [
      opp({ userId: "a", distanceBand: "VERY_CLOSE", moodState: "SUPER_READY", intention: "AVAILABLE_NOW", contextTags: ["Music"] }),
      opp({ userId: "b", distanceBand: "AROUND_ME", moodState: "OPEN", intention: "JUST_EXPLORING", contextTags: ["Food"] }),
      opp({ userId: "c", distanceBand: "NEARBY", moodState: "EXPLORING", contextTags: ["Music"] }),
    ];
    const ids = (xs: OpportunityPublic[]) => xs.map((o) => o.userId).sort();
    expect(ids(filterOpportunities(set, { proximity: ["VERY_CLOSE"] }))).toEqual(["a"]);
    expect(ids(filterOpportunities(set, { presence: ["OPEN"] }))).toEqual(["b"]);
    expect(ids(filterOpportunities(set, { intention: ["AVAILABLE_NOW"] }))).toEqual(["a"]);
    expect(ids(filterOpportunities(set, { interests: ["Music"] }))).toEqual(["a", "c"]);
    expect(filterOpportunities(set, { proximity: ["VERY_CLOSE"], presence: ["OPEN"] })).toEqual([]);
  });

  it("Pulse below threshold is quiet — never '1 woman nearby'", () => {
    const one = [opp({ userId: "a", moodState: "OPEN" })];
    const pulse = aggregatePulse(one);
    expect(pulse.quiet).toBe(true);
    expect(pulse.message).toBe("Activity is quiet nearby");
    expect(pulse.opportunityCount).toBeUndefined();
    expect(JSON.stringify(pulse).toLowerCase()).not.toContain("woman");
    expect(JSON.stringify(pulse)).not.toContain("1 ");
  });

  it("Pulse at threshold returns aggregates without identifying fields", () => {
    const many = Array.from({ length: PULSE_MIN_THRESHOLD }, (_, i) =>
      opp({ userId: `u${i}`, moodState: "OPEN", contextTags: ["Music"], destiny: true }),
    );
    const pulse = aggregatePulse(many);
    expect(pulse.quiet).toBe(false);
    expect(pulse.opportunityCount).toBe(PULSE_MIN_THRESHOLD);
    expect(pulse.peopleActive).toBe("few");
    expect(payloadLeaksCoordinates(pulse)).toBe(false);
    expect(pulse.destinyCount).toBe(PULSE_MIN_THRESHOLD);
    expect(quietPulse().quiet).toBe(true);
  });

  it("large candidate set is bounded and overflow becomes anonymous clusters", () => {
    const list = Array.from({ length: 250 }, (_, i) =>
      opp({
        userId: `u${i}`,
        distanceBand: i % 2 === 0 ? "NEARBY" : "AROUND_ME",
        bearingBucket: i % 2 === 0 ? "N" : "S",
      }),
    );
    const bounded = boundOpportunities(list);
    expect(bounded.opportunities).toHaveLength(MAX_PUBLIC_OPPORTUNITIES);
    expect(bounded.truncated).toBe(true);
    expect(bounded.clusters.every((c) => c.count >= 1)).toBe(true);
    expect(bounded.clusters.every((c) => !("userId" in c))).toBe(true);
    const clusterSum = bounded.clusters.reduce((n, c) => n + c.count, 0);
    expect(clusterSum).toBe(150);
  });

  it("Destiny flag is a boolean halo — no path / when / coordinates", () => {
    const pub = projectOpportunity({
      viewerId: "v",
      otherId: "d",
      meters: 30,
      bearingDeg: 10,
      destiny: true,
    });
    expect(pub.destiny).toBe(true);
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/path|trail|history|when|address/i);
    expect(payloadLeaksCoordinates(pub)).toBe(false);
  });
});

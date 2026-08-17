import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock.js";
import { WingmanEngine } from "./engine.js";
import { WINDOWS_MS } from "./types.js";

function seedPair(engine: WingmanEngine) {
  engine.seedUser({
    id: "a",
    profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
  });
  engine.seedUser({
    id: "b",
    profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] },
  });
}

describe("Radar eligibility (production invariant)", () => {
  it("one user only → nearbyCount=0", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    expect(engine.getCandidates("a")).toEqual([]);
  });

  it("two real eligible users → nearbyCount=1 each side", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    expect(engine.getCandidates("a").map((c) => c.userId)).toEqual(["b"]);
    expect(engine.getCandidates("b").map((c) => c.userId)).toEqual(["a"]);
  });

  it("self must never appear in own Radar", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    const ids = engine.getCandidates("a").map((c) => c.userId);
    expect(ids).not.toContain("a");
  });

  it("user offline → not nearby", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    engine.deactivateRadar("b");
    expect(engine.getCandidates("a")).toEqual([]);
  });

  it("user invisible → not nearby", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 }, "INVISIBLE");
    expect(engine.getCandidates("a")).toEqual([]);
  });

  it("user not eligible (interest mismatch) → not nearby", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine.seedUser({
      id: "b",
      profile: { userId: "b", gender: "MALE", interestedIn: ["MEN"] },
    });
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    expect(engine.getCandidates("a")).toEqual([]);
  });

  it("stale presence (TTL expired / reap) → not nearby", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    expect(engine.getCandidates("a")).toHaveLength(1);
    clock.advanceMs(WINDOWS_MS.PRESENCE_TTL + 1);
    engine.reapPresence();
    expect(() => engine.getCandidates("a")).toThrow();
    // Re-activate viewer only — peer remains stale/offline
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    expect(engine.getCandidates("a")).toEqual([]);
  });
});

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

describe("S1 presence", () => {
  it("reaper removes ghost users from radar", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    expect(engine.getCandidates("a")).toHaveLength(1);

    clock.advanceMs(WINDOWS_MS.PRESENCE_TTL + 1);
    const ghosts = engine.reapPresence();
    expect(ghosts.sort()).toEqual(["a", "b"]);
    expect(engine.presence.get("b")?.online).toBe(false);
    expect(() => engine.getCandidates("a")).toThrow();
  });

  it("heartbeat before TTL keeps radar-visible presence", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    clock.advanceMs(WINDOWS_MS.PRESENCE_TTL - 1_000);
    engine.heartbeat("a");
    engine.heartbeat("b");
    clock.advanceMs(2_000);
    expect(engine.getCandidates("a")).toHaveLength(1);
    expect(engine.getCandidates("b")[0].userId).toBe("a");
  });
});

describe("S2 radar privacy", () => {
  it("eligible users see each other without exact coordinates", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.activateRadar("a", { lat: 48.85661234, lng: 2.35221234 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    const stored = engine.locations.get("a")!;
    expect(stored.lat).toBe(48.8566);
    expect(stored.lng).toBe(2.3522);
    const c = engine.getCandidates("a", 50, 200);
    expect(c).toEqual([
      expect.objectContaining({ userId: "b", approximateDistanceBand: expect.any(String) }),
    ]);
    expect(JSON.stringify(c)).not.toMatch(/48\.8567/);
  });
});

describe("S3 signal limits", () => {
  it("enforces quota and prevents double active signal", () => {
    const clock = new FakeClock(new Date("2026-08-08T09:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    seedPair(engine);
    engine.seedUser({
      id: "c",
      profile: { userId: "c", gender: "FEMALE", interestedIn: ["MEN"] },
    });
    engine.activateRadar("a", { lat: 48.85, lng: 2.35 });
    engine.activateRadar("b", { lat: 48.8501, lng: 2.3501 });
    engine.activateRadar("c", { lat: 48.8502, lng: 2.3502 });

    engine.sendSignal("a", "b");
    try {
      engine.sendSignal("a", "b");
      expect.fail("expected pair active");
    } catch (e) {
      expect((e as { code: string }).code).toBe("SIGNAL_PAIR_ACTIVE");
    }
    engine.sendSignal("a", "c");
    expect(() => engine.sendSignal("a", "b")).toThrow();
    // free quota = 2
    engine.seedUser({
      id: "d",
      profile: { userId: "d", gender: "FEMALE", interestedIn: ["MEN"] },
    });
    engine.activateRadar("d", { lat: 48.8503, lng: 2.3503 });
    // cancel previous to free pair uniqueness but quota still consumed
    const active = [...engine.signals.values()].filter((s) => s.senderId === "a" && s.isActive);
    for (const s of active) engine.cancelSignal(s.id, "a");
    try {
      engine.sendSignal("a", "d");
      expect.fail("expected quota exceeded");
    } catch (e) {
      expect((e as { code: string }).code).toBe("SIGNAL_QUOTA_EXCEEDED");
    }
  });
});

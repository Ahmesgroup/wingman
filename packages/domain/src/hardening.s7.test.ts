import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock.js";
import { WingmanEngine } from "./engine.js";

describe("S7 hardening races", () => {
  it("concurrent accept attempts only create one connection", () => {
    const clock = new FakeClock(new Date("2026-08-08T22:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
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

    const results: Array<"ok" | "err"> = [];
    for (let i = 0; i < 2; i++) {
      try {
        engine.acceptSignal(sig.id, "b");
        results.push("ok");
      } catch {
        results.push("err");
      }
    }
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(engine.connections.size).toBe(1);
    expect(engine.locks.size).toBe(2);
  });

  it("reconcile is idempotent when nothing expired", () => {
    const clock = new FakeClock(new Date("2026-08-08T22:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine.activateRadar("a", { lat: 1, lng: 1 });
    const a = engine.reconcile();
    const b = engine.reconcile();
    expect(a).toEqual({ presence: [], signals: [], connections: [] });
    expect(b).toEqual({ presence: [], signals: [], connections: [] });
  });
});

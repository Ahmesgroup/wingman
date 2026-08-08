import { describe, expect, it } from "vitest";
import { FakeClock, WingmanEngine, WINDOWS_MS } from "@wingman/domain";
import { runReconcilePass } from "./reconcile.js";

describe("worker reconcile", () => {
  it("expires stale presence and signals without exact-second cron", () => {
    const clock = new FakeClock(new Date("2026-08-08T20:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine.seedUser({
      id: "b",
      profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] },
    });
    engine.activateRadar("a", { lat: 1, lng: 1 });
    engine.activateRadar("b", { lat: 1.0001, lng: 1.0001 });
    engine.sendSignal("a", "b");

    clock.advanceMs(WINDOWS_MS.PRESENCE_TTL + WINDOWS_MS.SIGNAL);
    const r = runReconcilePass(engine);
    expect(r.presence.length).toBe(2);
    expect(r.signals.length).toBe(1);
    expect(engine.signals.values().next().value?.status).toBe("EXPIRED");
  });
});

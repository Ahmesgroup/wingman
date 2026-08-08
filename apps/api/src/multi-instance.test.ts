import { describe, expect, it } from "vitest";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryProtocolRepository, ProtocolPersistenceMirror } from "@wingman/persistence";
import { SignalsService } from "./modules/signals/signals.controller.js";
import { InMemoryPushTransport, NotificationOrchestrator } from "@wingman/notifications";

describe("S10 multi-instance lock envelope", () => {
  it("only one accept wins the distributed lock across service instances", async () => {
    const clock = new FakeClock(new Date("2026-08-09T01:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({ id: "a", profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] } });
    engine.seedUser({ id: "b", profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] } });
    engine.activateRadar("a", { lat: 1, lng: 1 });
    engine.activateRadar("b", { lat: 1.0001, lng: 1.0001 });
    const sig = engine.sendSignal("a", "b");

    const shared = new MemoryEphemeralStore();
    const orch = new NotificationOrchestrator(new InMemoryPushTransport());
    const mirror = new ProtocolPersistenceMirror(engine, new MemoryProtocolRepository());
    const inst1 = new SignalsService(engine, shared, orch, mirror);
    const inst2 = new SignalsService(engine, shared, orch, mirror);

    const results = await Promise.allSettled([inst1.accept(sig.id, "b"), inst2.accept(sig.id, "b")]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);
    expect(engine.connections.size).toBe(1);
  });
});

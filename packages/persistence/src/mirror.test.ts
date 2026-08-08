import { describe, expect, it } from "vitest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryProtocolRepository } from "./memory-repository.js";
import { ProtocolPersistenceMirror } from "./mirror.js";

describe("S13 protocol persistence mirror", () => {
  it("persists signal and connection without changing domain outcomes", async () => {
    const clock = new FakeClock(new Date("2026-08-09T00:20:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const repo = new MemoryProtocolRepository();
    const mirror = new ProtocolPersistenceMirror(engine, repo);

    engine.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine.seedUser({
      id: "b",
      profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] },
    });
    await mirror.mirrorUser("a");
    await mirror.mirrorUser("b");

    engine.activateRadar("a", { lat: 48.85, lng: 2.35 });
    engine.activateRadar("b", { lat: 48.8501, lng: 2.3501 });
    await mirror.mirrorPresence("a");

    const sig = engine.sendSignal("a", "b");
    await mirror.mirrorSignal(sig.id);
    expect((await repo.getSignal(sig.id))?.status).toBe("PENDING");

    const conn = engine.acceptSignal(sig.id, "b");
    await mirror.mirrorSignal(sig.id);
    await mirror.mirrorConnection(conn.id);

    const stored = await repo.getConnection(conn.id);
    expect(stored?.state).toBe("WAITING_FOR_INITIATOR_SELFIE");
    expect(engine.connections.get(conn.id)?.state).toBe(stored?.state);

    const stats = await repo.stats();
    expect(stats.users).toBe(2);
    expect(stats.signals).toBe(1);
    expect(stats.connections).toBe(1);
  });
});

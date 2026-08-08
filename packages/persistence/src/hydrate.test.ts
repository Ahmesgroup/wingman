import { describe, expect, it } from "vitest";
import { FakeClock, WingmanEngine, WINDOWS_MS } from "@wingman/domain";
import { MemoryProtocolRepository } from "./memory-repository.js";
import { ProtocolPersistenceMirror } from "./mirror.js";
import { hydrateFromRepository } from "./hydrate.js";

describe("S16 deterministic boot hydration", () => {
  it("restarts without durable protocol divergence and without reviving presence", async () => {
    const clock = new FakeClock(new Date("2026-08-09T02:00:00.000Z"));
    const repo = new MemoryProtocolRepository();

    const engine1 = new WingmanEngine({ clock });
    const mirror = new ProtocolPersistenceMirror(engine1, repo);
    engine1.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine1.seedUser({
      id: "b",
      profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] },
    });
    await mirror.mirrorUser("a");
    await mirror.mirrorUser("b");

    engine1.activateRadar("a", { lat: 48.85, lng: 2.35 });
    engine1.activateRadar("b", { lat: 48.8501, lng: 2.3501 });
    await mirror.mirrorPresence("a");
    await mirror.mirrorPresence("b");

    const sig = engine1.sendSignal("a", "b");
    await mirror.mirrorSignal(sig.id);
    await mirror.mirrorSignalUsage("a");
    const conn = engine1.acceptSignal(sig.id, "b");
    await mirror.mirrorAccept(sig.id, conn.id);

    expect(engine1.presence.get("a")?.online).toBe(true);
    expect(repo.presence.size).toBe(2);

    // Process restart: new engine, same durable repo
    const engine2 = new WingmanEngine({ clock });
    const report = await hydrateFromRepository(engine2, repo);

    expect(report.presenceRestored).toBe(0);
    expect(engine2.presence.size).toBe(0);
    expect(engine2.locations.size).toBe(0);
    expect(engine2.users.size).toBe(2);
    expect(engine2.connections.get(conn.id)?.state).toBe("WAITING_FOR_INITIATOR_SELFIE");
    expect(engine2.signals.get(sig.id)?.status).toBe("ACCEPTED");
    expect(engine2.locks.has("a")).toBe(true);
    expect(engine2.locks.has("b")).toBe(true);
    expect(engine2.signalUsage.size).toBeGreaterThanOrEqual(1);
  });

  it("expires stale durable timers on hydrate via domain reconcile", async () => {
    const clock = new FakeClock(new Date("2026-08-09T02:00:00.000Z"));
    const repo = new MemoryProtocolRepository();
    const engine1 = new WingmanEngine({ clock });
    const mirror = new ProtocolPersistenceMirror(engine1, repo);

    engine1.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine1.seedUser({
      id: "b",
      profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] },
    });
    await mirror.mirrorUser("a");
    await mirror.mirrorUser("b");
    engine1.activateRadar("a", { lat: 1, lng: 1 });
    engine1.activateRadar("b", { lat: 1.0001, lng: 1.0001 });
    const sig = engine1.sendSignal("a", "b");
    await mirror.mirrorSignal(sig.id);

    clock.advanceMs(WINDOWS_MS.SIGNAL + 1);

    const engine2 = new WingmanEngine({ clock });
    await hydrateFromRepository(engine2, repo);
    expect(engine2.signals.get(sig.id)?.isActive).toBe(false);
    expect(engine2.signals.get(sig.id)?.status).toBe("EXPIRED");
  });
});

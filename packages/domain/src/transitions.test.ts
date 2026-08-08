import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock.js";
import {
  allConnectionTransitions,
  canTransition,
  listAllowedEvents,
  transitionConnection,
} from "./connection/transitions.js";
import { DomainError } from "./errors.js";
import { WingmanEngine } from "./engine.js";
import { WINDOWS_MS } from "./types.js";

describe("connection state machine matrix", () => {
  it("enumerates allowed transitions and rejects forbidden ones", () => {
    const allowed = allConnectionTransitions();
    expect(allowed.length).toBeGreaterThan(20);

    for (const t of allowed) {
      expect(canTransition(t.from, t.event)).toBe(true);
      expect(transitionConnection(t.from, t.event)).toBe(t.to);
    }

    expect(() => transitionConnection("COMPLETED", "meet_now")).toThrow(DomainError);
    expect(() => transitionConnection("WAITING_FOR_INITIATOR_SELFIE", "meet_now")).toThrow(DomainError);
    expect(() => transitionConnection("MUTUALLY_VALIDATED", "initiator_selfie")).toThrow(DomainError);
    expect(listAllowedEvents("EXPIRED")).toEqual([]);
  });

  it("silent expiry never marks notify=true on signal expire events", () => {
    const clock = new FakeClock(new Date("2026-08-08T10:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
    });
    engine.seedUser({
      id: "b",
      profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] },
    });
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.8567, lng: 2.3523 });
    const sig = engine.sendSignal("a", "b");
    clock.advanceMs(WINDOWS_MS.SIGNAL + 1);
    engine.reapSignals();
    const expiredEvents = engine.events.filter((e) => e.type === "signal.expired" && e.payload.signalId === sig.id);
    expect(expiredEvents).toHaveLength(1);
    expect(expiredEvents[0]!.notify).toBe(false);
  });
});

describe("full protocol loop", () => {
  function setup() {
    const clock = new FakeClock(new Date("2026-08-08T12:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({
      id: "a",
      profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"], mood: "OPEN" },
    });
    engine.seedUser({
      id: "b",
      profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"], mood: "OPEN" },
    });
    return { clock, engine };
  }

  it("runs Presence→Radar→Signal→Validation→Match→Mission→Cooldown→Radar", () => {
    const { clock, engine } = setup();
    engine.activateRadar("a", { lat: 48.8566, lng: 2.3522 });
    engine.activateRadar("b", { lat: 48.85665, lng: 2.35225 });

    const candidatesA = engine.getCandidates("a");
    expect(candidatesA.map((c) => c.userId)).toContain("b");
    expect(candidatesA[0]).not.toHaveProperty("lat");

    const sig = engine.sendSignal("a", "b", "idem-1");
    const replay = engine.sendSignal("a", "b", "idem-1");
    expect(replay.id).toBe(sig.id);
    try {
      engine.sendSignal("a", "b", "idem-2");
      expect.fail("expected pair active");
    } catch (e) {
      expect((e as DomainError).code).toBe("SIGNAL_PAIR_ACTIVE");
    }

    engine.openSignal(sig.id, "b");
    const conn = engine.acceptSignal(sig.id, "b");
    expect(conn.state).toBe("WAITING_FOR_INITIATOR_SELFIE");
    expect(engine.getCandidates("a")).toEqual([]);

    engine.applyConnection(conn.id, "initiator_selfie", "a", { mediaId: "media_a" });
    engine.applyConnection(conn.id, "recipient_selfie", "b", { mediaId: "media_b" });
    const matched = engine.applyConnection(conn.id, "initiator_approve", "a");
    expect(matched.state).toBe("MUTUALLY_VALIDATED");
    expect(matched.mutuallyValidatedAt).toBeTruthy();

    const mission = engine.applyConnection(conn.id, "meet_now", "a");
    expect(mission.state).toBe("MISSION_MEET_ACTIVE");
    const msg = engine.postMissionMessage(conn.id, "a", "hello call me +33612345678");
    expect(msg.filtered).toBe(true);
    expect(msg.text).toContain("[filtered]");

    engine.applyConnection(conn.id, "lets_meet", "a");
    engine.applyConnection(conn.id, "chat_closed", "a");
    engine.recordOutcome(conn.id, "a", "YES");
    const cooling = engine.recordOutcome(conn.id, "b", "YES");
    expect(cooling.state).toBe("COOLDOWN_ACTIVE");
    expect(cooling.metConfirmed).toBe(true);

    clock.advanceMs(WINDOWS_MS.COOLDOWN_YES + 1);
    engine.reapConnections();
    expect(engine.connections.get(conn.id)?.state).toBe("COMPLETED");
    expect(engine.locks.size).toBe(0);

    engine.setPresenceVisibility("a", "ACTIVE");
    engine.setPresenceVisibility("b", "ACTIVE");
    expect(engine.getCandidates("a").map((c) => c.userId)).toContain("b");
  });

  it("cannot create match without mutual validation", () => {
    const { engine } = setup();
    engine.activateRadar("a", { lat: 48.85, lng: 2.35 });
    engine.activateRadar("b", { lat: 48.8501, lng: 2.3501 });
    const sig = engine.sendSignal("a", "b");
    const conn = engine.acceptSignal(sig.id, "b");
    expect(() => engine.applyConnection(conn.id, "meet_now", "a")).toThrow(DomainError);
    expect(engine.connections.get(conn.id)?.state).toBe("WAITING_FOR_INITIATOR_SELFIE");
  });
});

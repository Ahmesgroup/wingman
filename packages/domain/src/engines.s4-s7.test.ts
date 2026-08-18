import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock.js";
import { DomainError } from "./errors.js";
import { WingmanEngine } from "./engine.js";
import { WINDOWS_MS } from "./types.js";

function readyPair(plus = false) {
  const clock = new FakeClock(new Date("2026-08-08T15:00:00.000Z"));
  const engine = new WingmanEngine({ clock, destinyEnabled: false });
  engine.seedUser({
    id: "a",
    wingmanPlus: plus,
    profile: { userId: "a", gender: "MALE", interestedIn: ["WOMEN"] },
  });
  engine.seedUser({
    id: "b",
    wingmanPlus: plus,
    profile: { userId: "b", gender: "FEMALE", interestedIn: ["MEN"] },
  });
  engine.activateRadar("a", { lat: 48.85, lng: 2.35 });
  engine.activateRadar("b", { lat: 48.85005, lng: 2.35005 });
  return { clock, engine };
}

describe("S4 mutual validation", () => {
  it("match only after mutual selfie approval", () => {
    const { engine } = readyPair();
    const sig = engine.sendSignal("a", "b");
    const conn = engine.acceptSignal(sig.id, "b");
    expect(() =>
      engine.applyConnection(conn.id, "initiator_approve", "a"),
    ).toThrow(DomainError);
    engine.applyConnection(conn.id, "initiator_selfie", "a", { mediaId: "m1" });
    engine.applyConnection(conn.id, "recipient_selfie", "b", { mediaId: "m2" });
    const matched = engine.applyConnection(conn.id, "initiator_approve", "a");
    expect(matched.state).toBe("MUTUALLY_VALIDATED");
  });
});

describe("S5 mission cycle", () => {
  it("ticket path and cooldown without frontend", () => {
    const { clock, engine } = readyPair(true);
    const sig = engine.sendSignal("a", "b");
    const conn = engine.acceptSignal(sig.id, "b");
    engine.applyConnection(conn.id, "initiator_selfie", "a", { mediaId: "m1" });
    engine.applyConnection(conn.id, "recipient_selfie", "b", { mediaId: "m2" });
    engine.applyConnection(conn.id, "initiator_approve", "a");
    engine.applyConnection(conn.id, "hold_ticket", "a");
    expect(engine.connections.get(conn.id)?.state).toBe("TICKET_ACTIVE");
    engine.applyConnection(conn.id, "ticket_available", "a");
    engine.applyConnection(conn.id, "ticket_confirm", "b");
    expect(engine.connections.get(conn.id)?.state).toBe("MISSION_MEET_ACTIVE");
    engine.applyConnection(conn.id, "not_this_time", "a");
    engine.recordOutcome(conn.id, "a", "NO");
    engine.recordOutcome(conn.id, "b", "NO");
    expect(engine.connections.get(conn.id)?.state).toBe("COOLDOWN_ACTIVE");
    clock.advanceMs(WINDOWS_MS.COOLDOWN_NO + 1);
    engine.reconcile();
    expect(engine.connections.get(conn.id)?.state).toBe("COMPLETED");
  });
});

describe("S6 safety privacy", () => {
  it("block excludes from radar and closes signal", () => {
    const { engine } = readyPair();
    const sig = engine.sendSignal("a", "b");
    engine.blockUser("b", "a");
    expect(engine.signals.get(sig.id)?.status).toBe("BLOCKED");
    expect(engine.getCandidates("a")).toEqual([]);
    expect(engine.getCandidates("b")).toEqual([]);
  });

  it("duplicate block is idempotent and still forbids a new Signal", () => {
    const { engine } = readyPair();
    const first = engine.blockUser("a", "b");
    const second = engine.blockUser("a", "b");
    expect(second.id).toBe(first.id);
    expect(engine.blocks.filter((b) => b.blockerId === "a" && b.blockedId === "b")).toHaveLength(1);
    expect(() => engine.sendSignal("a", "b")).toThrow(DomainError);
    expect(() => engine.sendSignal("b", "a")).toThrow(DomainError);
  });

  it("report persists independently of block", () => {
    const { engine } = readyPair();
    const report = engine.reportUser("a", "b", "HARASSMENT");
    expect(engine.reports).toHaveLength(1);
    expect(engine.reports[0]?.id).toBe(report.id);
    expect(engine.reports[0]?.category).toBe("HARASSMENT");
    engine.blockUser("a", "b");
    expect(engine.reports).toHaveLength(1);
  });

  it("report burst is rate limited without dropping the block path", () => {
    const { engine } = readyPair();
    for (let i = 0; i < 8; i++) engine.reportUser("a", "b", "HARASSMENT");
    expect(() => engine.reportUser("a", "b", "HARASSMENT")).toThrow(DomainError);
    const block = engine.blockUser("a", "b");
    expect(block.blockerId).toBe("a");
  });

  it("consent records are append-only", () => {
    const { engine } = readyPair();
    engine.grantConsent("a", "CORE_MATCHING", "v1");
    engine.grantConsent("a", "CORE_MATCHING", "v1");
    expect(engine.consents.filter((c) => c.userId === "a")).toHaveLength(2);
  });
});

describe("S7 destiny feature flag", () => {
  it("destiny prompt refused when disabled", () => {
    const { engine } = readyPair();
    engine.grantConsent("a", "DESTINY_CONNECTION", "v1");
    engine.grantConsent("b", "DESTINY_CONNECTION", "v1");
    engine.noteCopresence("a", "b");
    try {
      engine.tryDestinyPrompt("a", "b");
      expect.fail("expected destiny disabled");
    } catch (e) {
      expect((e as { code: string }).code).toBe("DESTINY_DISABLED");
    }
  });

  it("destiny prompt works when enabled", () => {
    const { engine } = readyPair();
    engine.destinyEnabled = true;
    engine.grantConsent("a", "DESTINY_CONNECTION", "v1");
    engine.grantConsent("b", "DESTINY_CONNECTION", "v1");
    engine.noteCopresence("a", "b");
    expect(engine.tryDestinyPrompt("a", "b")).toBe(true);
    expect(engine.tryDestinyPrompt("a", "b")).toBe(false);
  });
});

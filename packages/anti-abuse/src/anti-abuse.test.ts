import { describe, expect, it } from "vitest";
import { AntiAbuseEngine } from "./engine.js";
import { AntiAbuseError } from "./errors.js";
import { applyAbusePolicy } from "./policy.js";
import { deriveRiskSignals } from "./risk.js";
import { MemoryAbuseStateStore } from "./store.js";
import type { AbuseEvent } from "./types.js";
import { DEFAULT_POLICY_THRESHOLDS } from "./types.js";

function ev(
  partial: Partial<AbuseEvent> & Pick<AbuseEvent, "id" | "kind" | "actorId" | "at">,
): AbuseEvent {
  return partial;
}

describe("S24 Anti-Abuse package", () => {
  it("missing events → ALLOW", () => {
    expect(deriveRiskSignals([], new Date())).toEqual([]);
    expect(applyAbusePolicy([]).action).toBe("ALLOW");
  });

  it("signal_burst produces COOLDOWN on SIGNAL_CREATE only", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const events: AbuseEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(
        ev({
          id: `s${i}`,
          kind: "signal.sent",
          actorId: "u",
          subjectId: `t${i}`,
          at: new Date(now.getTime() - i * 1000),
        }),
      );
    }
    const signals = deriveRiskSignals(events, now);
    expect(signals).toContain("signal_burst");
    const policy = applyAbusePolicy(signals);
    expect(policy.action).toBe("COOLDOWN");
    expect(policy.scopes).toEqual(["SIGNAL_CREATE"]);
  });

  it("radar scraping → SLOW_DOWN on RADAR only", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const events = Array.from({ length: 30 }, (_, i) =>
      ev({
        id: `r${i}`,
        kind: "radar.candidates",
        actorId: "u",
        at: new Date(now.getTime() - i * 100),
      }),
    );
    const policy = applyAbusePolicy(deriveRiskSignals(events, now));
    expect(policy.action).toBe("SLOW_DOWN");
    expect(policy.scopes).toEqual(["RADAR_CANDIDATES"]);
  });

  it("shadow mode never writes sanctions", () => {
    const store = new MemoryAbuseStateStore();
    const engine = new AntiAbuseEngine(store, {
      ...DEFAULT_POLICY_THRESHOLDS,
      signalBurstCount: 3,
    });
    const now = new Date("2026-08-09T12:00:00.000Z");
    for (let i = 0; i < 3; i++) {
      engine.observeAndEvaluate(
        {
          kind: "signal.sent",
          actorId: "a",
          subjectId: `t${i}`,
          at: now,
          eventId: `e${i}`,
        },
        { enforcementEnabled: false },
      );
    }
    expect(store.getSanction("a", now)).toBeUndefined();
    expect(() => engine.assertAllowed("a", "SIGNAL_CREATE", now)).not.toThrow();
  });

  it("enforcement writes cooldown; Radar scope still allowed", () => {
    const store = new MemoryAbuseStateStore();
    const engine = new AntiAbuseEngine(store, {
      ...DEFAULT_POLICY_THRESHOLDS,
      signalBurstCount: 3,
      cooldownMs: 60_000,
    });
    const now = new Date("2026-08-09T12:00:00.000Z");
    for (let i = 0; i < 3; i++) {
      engine.observeAndEvaluate(
        {
          kind: "signal.sent",
          actorId: "a",
          subjectId: `t${i}`,
          at: now,
          eventId: `e${i}`,
        },
        { enforcementEnabled: true },
      );
    }
    expect(store.getSanction("a", now)?.action).toBe("COOLDOWN");
    expect(() => engine.assertAllowed("a", "SIGNAL_CREATE", now)).toThrow(AntiAbuseError);
    expect(() => engine.assertAllowed("a", "RADAR_CANDIDATES", now)).not.toThrow();
  });

  it("same eventId replay does not double-penalize / stack", () => {
    const store = new MemoryAbuseStateStore();
    const engine = new AntiAbuseEngine(store, {
      ...DEFAULT_POLICY_THRESHOLDS,
      signalBurstCount: 2,
      cooldownMs: 60_000,
    });
    const now = new Date("2026-08-09T12:00:00.000Z");
    engine.observeAndEvaluate(
      { kind: "signal.sent", actorId: "a", subjectId: "t1", at: now, eventId: "same" },
      { enforcementEnabled: true },
    );
    engine.observeAndEvaluate(
      { kind: "signal.sent", actorId: "a", subjectId: "t2", at: now, eventId: "same" },
      { enforcementEnabled: true },
    );
    // Only one event counted → no burst yet
    expect(store.listEvents("a", new Date(0), now)).toHaveLength(1);
    expect(store.getSanction("a", now)).toBeUndefined();
  });

  it("sanctions expire", () => {
    const store = new MemoryAbuseStateStore();
    const engine = new AntiAbuseEngine(store, {
      ...DEFAULT_POLICY_THRESHOLDS,
      signalBurstCount: 2,
      cooldownMs: 1000,
    });
    const t0 = new Date("2026-08-09T12:00:00.000Z");
    engine.observeAndEvaluate(
      { kind: "signal.sent", actorId: "a", subjectId: "t1", at: t0, eventId: "1" },
      { enforcementEnabled: true },
    );
    engine.observeAndEvaluate(
      { kind: "signal.sent", actorId: "a", subjectId: "t2", at: t0, eventId: "2" },
      { enforcementEnabled: true },
    );
    expect(store.getSanction("a", t0)?.action).toBe("COOLDOWN");
    const later = new Date(t0.getTime() + 2000);
    expect(store.getSanction("a", later)).toBeUndefined();
    expect(() => engine.assertAllowed("a", "SIGNAL_CREATE", later)).not.toThrow();
  });

  it("shared store = multi-instance same cooldown", () => {
    const shared = new MemoryAbuseStateStore();
    const a = new AntiAbuseEngine(shared, {
      ...DEFAULT_POLICY_THRESHOLDS,
      signalBurstCount: 2,
      cooldownMs: 60_000,
    });
    const b = new AntiAbuseEngine(shared, {
      ...DEFAULT_POLICY_THRESHOLDS,
      signalBurstCount: 2,
      cooldownMs: 60_000,
    });
    const now = new Date("2026-08-09T12:00:00.000Z");
    a.observeAndEvaluate(
      { kind: "signal.sent", actorId: "u", subjectId: "x", at: now, eventId: "1" },
      { enforcementEnabled: true },
    );
    a.observeAndEvaluate(
      { kind: "signal.sent", actorId: "u", subjectId: "y", at: now, eventId: "2" },
      { enforcementEnabled: true },
    );
    expect(() => b.assertAllowed("u", "SIGNAL_CREATE", now)).toThrow(AntiAbuseError);
  });

  it("public sanction view omits reasons", () => {
    const store = new MemoryAbuseStateStore();
    const engine = new AntiAbuseEngine(store, {
      ...DEFAULT_POLICY_THRESHOLDS,
      signalBurstCount: 2,
      cooldownMs: 60_000,
    });
    const now = new Date("2026-08-09T12:00:00.000Z");
    engine.observeAndEvaluate(
      { kind: "signal.sent", actorId: "a", subjectId: "t1", at: now, eventId: "1" },
      { enforcementEnabled: true },
    );
    engine.observeAndEvaluate(
      { kind: "signal.sent", actorId: "a", subjectId: "t2", at: now, eventId: "2" },
      { enforcementEnabled: true },
    );
    const view = engine.getPublicSanctionView("a", now);
    expect(view?.action).toBe("COOLDOWN");
    expect(JSON.stringify(view)).not.toMatch(/signal_burst|reasons/);
  });

  it("reject → resend pattern", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const events = [
      ev({
        id: "1",
        kind: "signal.refused_by_target",
        actorId: "a",
        subjectId: "b",
        at: new Date(now.getTime() - 60_000),
      }),
      ev({
        id: "2",
        kind: "signal.sent",
        actorId: "a",
        subjectId: "b",
        at: now,
      }),
    ];
    expect(deriveRiskSignals(events, now)).toContain("reject_resend_pattern");
  });
});

import { describe, expect, it } from "vitest";
import {
  ContextEngine,
  MemoryContextInputStore,
  isContextEngineEnabled,
  normalizeContext,
  sharedLanguages,
  usableContext,
} from "./index.js";

describe("S22 Context Engine", () => {
  it("flag defaults off", () => {
    expect(isContextEngineEnabled({})).toBe(false);
    expect(isContextEngineEnabled({ CONTEXT_ENGINE_ENABLED: "true" })).toBe(true);
  });

  it("normalizes five families with confidence and TTL; no coordinates", () => {
    const now = new Date("2026-08-09T09:50:00.000Z");
    const snap = normalizeContext(
      {
        userId: "u_123",
        languages: ["FR", "en-US", "bad!!!"],
        availabilityMinutes: 25,
        mobility: "walking",
        intention: "social",
        mood: "OPEN",
        presenceRemainingMs: 90_000,
        capturedAt: now,
      },
      now,
    );
    expect(snap.context.languages).toEqual(["en", "fr"]);
    expect(snap.context.availabilityMinutes).toBe(25);
    expect(snap.context.mobility).toBe("walking");
    expect(snap.context.intention).toBe("social");
    expect(snap.context.mood).toBe("open");
    expect(snap.confidence.languages).toBe(1);
    expect(snap.expiresAt > snap.capturedAt).toBe(true);
    expect(JSON.stringify(snap)).not.toMatch(/lat|lng|48\./);
  });

  it("same hints + same timestamp → same snapshot (deterministic)", () => {
    const now = new Date("2026-08-09T09:50:00.000Z");
    const hints = {
      userId: "u1",
      languages: ["fr", "en"],
      availabilityMinutes: 10,
      capturedAt: now,
    };
    expect(normalizeContext(hints, now)).toEqual(normalizeContext(hints, now));
  });

  it("expired context is ignored", () => {
    const captured = new Date("2026-08-09T09:00:00.000Z");
    const snap = normalizeContext(
      { userId: "u1", availabilityMinutes: 5, capturedAt: captured },
      captured,
    );
    const later = new Date(snap.expiresAt);
    later.setMilliseconds(later.getMilliseconds() + 1);
    expect(usableContext(snap, later)).toBeUndefined();
  });

  it("low-confidence fields are stripped (neutral for consumers)", () => {
    const now = new Date("2026-08-09T09:50:00.000Z");
    const snap = normalizeContext(
      {
        userId: "u1",
        languages: ["fr"],
        languagesConfidence: 0.2,
        mood: "open",
        moodConfidence: 0.9,
        capturedAt: now,
      },
      now,
    );
    const usable = usableContext(snap, now)!;
    expect(usable.context.languages).toBeUndefined();
    expect(usable.context.mood).toBe("open");
  });

  it("unknown language is neutral — not incompatible", () => {
    const now = new Date("2026-08-09T09:50:00.000Z");
    const a = usableContext(
      normalizeContext({ userId: "a", languages: ["fr"], capturedAt: now }, now),
      now,
    );
    const b = usableContext(normalizeContext({ userId: "b", capturedAt: now }, now), now);
    expect(sharedLanguages(a, b).usable).toBe(false);
    expect(sharedLanguages(a, b).shared).toEqual([]);
  });

  it("engine respects flag and input port", () => {
    const store = new MemoryContextInputStore();
    store.upsert({ userId: "u1", languages: ["fr"], availabilityMinutes: 20 });
    const disabled = new ContextEngine(store, () => false);
    const enabled = new ContextEngine(store, () => true);
    const now = new Date("2026-08-09T09:50:00.000Z");
    expect(disabled.getSnapshot("u1", now)).toBeUndefined();
    expect(enabled.getSnapshot("u1", now)?.context.languages).toEqual(["fr"]);
  });

  it("distinguishes stable vs session vs ephemeral TTL pressure", () => {
    const now = new Date("2026-08-09T09:50:00.000Z");
    const stableOnly = normalizeContext({ userId: "a", languages: ["fr"], capturedAt: now }, now);
    const withEphemeral = normalizeContext(
      { userId: "a", languages: ["fr"], availabilityMinutes: 5, capturedAt: now },
      now,
    );
    expect(new Date(withEphemeral.expiresAt).getTime()).toBeLessThan(
      new Date(stableOnly.expiresAt).getTime(),
    );
  });
});

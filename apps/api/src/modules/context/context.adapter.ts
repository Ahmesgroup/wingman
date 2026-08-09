import type { WingmanEngine } from "@wingman/domain";
import {
  ContextEngine,
  MemoryContextInputStore,
  type ContextInputsPort,
  type ContextRawHints,
  type ContextReaderPort,
  type ContextSnapshot,
} from "@wingman/context-engine";
import type { RadarContextPort } from "@wingman/radar-intelligence";

/**
 * Merges durable/session hints store with live presence/profile.
 * Never reads or stores exact coordinates.
 */
export class NestContextInputsPort implements ContextInputsPort {
  constructor(
    private readonly store: MemoryContextInputStore,
    private readonly engine: WingmanEngine,
  ) {}

  getRawHints(userId: string, now: Date): ContextRawHints | undefined {
    const stored = this.store.getRawHints(userId, now);
    const user = this.engine.users.get(userId);
    const presence = this.engine.presence.get(userId);
    if (!stored && !user && !presence) return undefined;

    const hints: ContextRawHints = {
      ...stored,
      userId,
      capturedAt: stored?.capturedAt ?? now,
    };

    if (!hints.intention && user?.profile.intention) {
      hints.intention = user.profile.intention;
      hints.intentionConfidence = hints.intentionConfidence ?? 0.75;
    }
    if (!hints.mood && user?.profile.mood) {
      hints.mood = user.profile.mood;
      hints.moodConfidence = hints.moodConfidence ?? 0.7;
    }
    if (presence) {
      hints.presenceRemainingMs = Math.max(0, presence.expiresAt.getTime() - now.getTime());
      hints.heartbeatAgeMs = Math.max(0, now.getTime() - presence.lastHeartbeatAt.getTime());
      hints.freshnessConfidence = hints.freshnessConfidence ?? 0.85;
      if (hints.availabilityMinutes === undefined) {
        hints.availabilityMinutes = Math.round(hints.presenceRemainingMs / 60_000);
        hints.availabilityConfidence = hints.availabilityConfidence ?? 0.8;
      }
    }
    return hints;
  }
}

/** Adapts ContextReaderPort → RadarContextPort without leaking engine internals into ranking. */
export class ContextToRadarAdapter implements RadarContextPort {
  constructor(private readonly reader: ContextReaderPort) {}

  forUser(userId: string, now: Date) {
    const snap = this.reader.getSnapshot(userId, now);
    if (!snap) return undefined;
    return {
      languages: snap.context.languages,
      availabilityMinutes: snap.context.availabilityMinutes,
      mobility: snap.context.mobility,
      intention: snap.context.intention,
      mood: snap.context.mood,
      freshness: snap.context.freshness,
    };
  }
}

export type { ContextSnapshot, ContextEngine, MemoryContextInputStore };

import type { Clock } from "../clock.js";
import { addMs } from "../clock.js";
import { DomainError } from "../errors.js";
import { pairKey } from "../pair.js";

export interface DestinyCopresence {
  pairKey: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  promptEmitted: boolean;
}

const COPRESENCE_TTL_MS = 48 * 60 * 60 * 1000;

export function touchCopresence(
  existing: DestinyCopresence | undefined,
  userA: string,
  userB: string,
  clock: Clock,
): DestinyCopresence {
  const now = clock.now();
  const key = pairKey(userA, userB);
  if (!existing) {
    return {
      pairKey: key,
      firstSeenAt: now,
      lastSeenAt: now,
      expiresAt: addMs(now, COPRESENCE_TTL_MS),
      promptEmitted: false,
    };
  }
  return {
    ...existing,
    lastSeenAt: now,
    expiresAt: addMs(now, COPRESENCE_TTL_MS),
  };
}

export function emitDestinyPrompt(
  copresence: DestinyCopresence,
  enabled: boolean,
  bothConsented: boolean,
  clock: Clock,
): { copresence: DestinyCopresence; emit: boolean } {
  if (!enabled) {
    throw new DomainError("DESTINY_DISABLED", "Destiny is feature-flagged off (DPIA)");
  }
  if (!bothConsented) {
    return { copresence, emit: false };
  }
  if (copresence.promptEmitted) {
    return { copresence, emit: false };
  }
  if (clock.now().getTime() > copresence.expiresAt.getTime()) {
    return { copresence, emit: false };
  }
  return { copresence: { ...copresence, promptEmitted: true }, emit: true };
}

import type { Clock } from "../clock.js";
import { addMs } from "../clock.js";
import { DomainError } from "../errors.js";
import type { PresenceVisibility } from "../types.js";
import { WINDOWS_MS } from "../types.js";

export interface PresenceRecord {
  userId: string;
  visibility: PresenceVisibility;
  lastHeartbeatAt: Date;
  expiresAt: Date;
  online: boolean;
}

export function activatePresence(
  userId: string,
  visibility: PresenceVisibility,
  clock: Clock,
): PresenceRecord {
  if (visibility === "INVISIBLE") {
    // activating while invisible is allowed; user is online but not radar-visible
  }
  const now = clock.now();
  return {
    userId,
    visibility,
    lastHeartbeatAt: now,
    expiresAt: addMs(now, WINDOWS_MS.PRESENCE_TTL),
    online: true,
  };
}

export function heartbeat(presence: PresenceRecord, clock: Clock): PresenceRecord {
  if (!presence.online) {
    throw new DomainError("CONFLICT", "Cannot heartbeat offline presence");
  }
  const now = clock.now();
  return {
    ...presence,
    lastHeartbeatAt: now,
    expiresAt: addMs(now, WINDOWS_MS.PRESENCE_TTL),
  };
}

export function setVisibility(presence: PresenceRecord, visibility: PresenceVisibility, clock: Clock): PresenceRecord {
  return { ...heartbeat(presence, clock), visibility };
}

export function deactivatePresence(presence: PresenceRecord, clock: Clock): PresenceRecord {
  return {
    ...presence,
    online: false,
    visibility: "INVISIBLE",
    lastHeartbeatAt: clock.now(),
    expiresAt: clock.now(),
  };
}

export function expirePresenceIfNeeded(presence: PresenceRecord, clock: Clock): PresenceRecord | null {
  if (!presence.online) return null;
  if (clock.now().getTime() < presence.expiresAt.getTime()) return null;
  return {
    ...presence,
    online: false,
    visibility: "INVISIBLE",
    expiresAt: clock.now(),
  };
}

/** Radar-visible means online + ACTIVE (not mission/cooldown/busy/unavailable/invisible). */
export function isRadarVisible(presence: PresenceRecord | undefined, clock: Clock): boolean {
  if (!presence?.online) return false;
  if (clock.now().getTime() >= presence.expiresAt.getTime()) return false;
  return presence.visibility === "ACTIVE";
}

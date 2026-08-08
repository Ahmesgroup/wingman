/** Stable V1 realtime event types — transport only, no protocol rules. */
export type RealtimeEventType =
  | "presence.changed"
  | "radar.changed"
  | "signal.received"
  | "signal.updated"
  | "validation.updated"
  | "match.created"
  | "mission.updated"
  | "mission.expired"
  | "connection.closed";

export const REALTIME_ENVELOPE_VERSION = 1 as const;

export interface RealtimeEnvelope {
  eventId: string;
  type: RealtimeEventType;
  occurredAt: string;
  aggregateId: string;
  version: typeof REALTIME_ENVELOPE_VERSION;
  payload: Record<string, unknown>;
  /** Server-computed delivery rooms (never chosen freely by clients). */
  rooms: string[];
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function connectionRoom(connectionId: string): string {
  return `connection:${connectionId}`;
}

export function missionRoom(missionOrConnectionId: string): string {
  return `mission:${missionOrConnectionId}`;
}

export function radarRoom(zone: string): string {
  return `radar:${zone}`;
}

/** Coarse zone from protected lat/lng (matches domain precision protection spirit). */
export function radarZoneFromCoords(lat: number, lng: number, decimals = 3): string {
  return `${lat.toFixed(decimals)}:${lng.toFixed(decimals)}`;
}

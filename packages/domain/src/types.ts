export type PresenceVisibility = "ACTIVE" | "INVISIBLE" | "MISSION" | "COOLDOWN" | "BUSY" | "UNAVAILABLE";

export type SignalStatus = "PENDING" | "OPENED" | "ACCEPTED" | "EXPIRED" | "CANCELLED" | "BLOCKED";
export type SignalSource = "RADAR" | "DESTINY" | "REMATCH";

export type ConnectionState =
  | "WAITING_FOR_INITIATOR_SELFIE"
  | "WAITING_FOR_RECIPIENT_SELFIE"
  | "WAITING_FOR_INITIATOR_APPROVAL"
  | "MUTUALLY_VALIDATED"
  | "TICKET_ACTIVE"
  | "WAITING_FOR_TICKET_CONFIRMATION"
  | "MISSION_MEET_ACTIVE"
  | "MISSION_CONFIRMED"
  | "OUTCOME_PENDING"
  | "COOLDOWN_ACTIVE"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED"
  | "BLOCKED"
  | "FAILED";

export type MissionResponse = "PENDING" | "YES" | "NO" | "TIMEOUT";

export const TERMINAL_CONNECTION_STATES: ReadonlySet<ConnectionState> = new Set([
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "BLOCKED",
  "FAILED",
]);

export const ACTIVE_SIGNAL_STATUSES: ReadonlySet<SignalStatus> = new Set(["PENDING", "OPENED"]);

export const WINDOWS_MS = {
  SIGNAL: 10 * 60 * 1000,
  SELFIE: 5 * 60 * 1000,
  SELFIE_PLUS_EXTRA: 5 * 60 * 1000,
  TICKET_CONFIRM: 15 * 60 * 1000,
  TICKET_FREE: 2 * 60 * 60 * 1000,
  TICKET_PLUS: 24 * 60 * 60 * 1000,
  MISSION_FREE: 15 * 60 * 1000,
  MISSION_PLUS: 20 * 60 * 1000,
  COOLDOWN_YES: 30 * 60 * 1000,
  COOLDOWN_NO: 15 * 60 * 1000,
  PRESENCE_TTL: 120 * 1000,
  PURGE_AFTER: 30 * 24 * 60 * 60 * 1000,
} as const;

export const QUOTAS = {
  SIGNAL_FREE_DAILY: 2,
  SIGNAL_PLUS_DAILY: 25,
  TICKETS_FREE: 1,
  TICKETS_PLUS: 3,
} as const;

export interface Entitlements {
  wingmanPlus: boolean;
  signalDailyLimit: number;
  selfieWindowMs: number;
  ticketMaxDurationMs: number;
  missionMeetDurationMs: number;
  /** Max concurrent connection tickets (derived plan capability). */
  activeConnectionTickets: number;
}

export function entitlementsFor(wingmanPlus: boolean): Entitlements {
  return {
    wingmanPlus,
    signalDailyLimit: wingmanPlus ? QUOTAS.SIGNAL_PLUS_DAILY : QUOTAS.SIGNAL_FREE_DAILY,
    selfieWindowMs: WINDOWS_MS.SELFIE + (wingmanPlus ? WINDOWS_MS.SELFIE_PLUS_EXTRA : 0),
    ticketMaxDurationMs: wingmanPlus ? WINDOWS_MS.TICKET_PLUS : WINDOWS_MS.TICKET_FREE,
    missionMeetDurationMs: wingmanPlus ? WINDOWS_MS.MISSION_PLUS : WINDOWS_MS.MISSION_FREE,
    activeConnectionTickets: wingmanPlus ? QUOTAS.TICKETS_PLUS : QUOTAS.TICKETS_FREE,
  };
}

export interface DomainEvent {
  type: string;
  at: Date;
  payload: Record<string, unknown>;
  /** Silent expiry must never notify rejection */
  notify: boolean;
}

export interface AuditRecord {
  action: string;
  actorId?: string;
  subjectId?: string;
  at: Date;
  meta?: Record<string, unknown>;
}

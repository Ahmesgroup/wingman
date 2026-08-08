import { DomainError } from "../errors.js";
import type { ConnectionState } from "../types.js";
import { TERMINAL_CONNECTION_STATES } from "../types.js";

export type ConnectionEvent =
  | "initiator_selfie"
  | "recipient_selfie"
  | "initiator_approve"
  | "meet_now"
  | "hold_ticket"
  | "ticket_available"
  | "ticket_confirm"
  | "lets_meet"
  | "not_this_time"
  | "chat_closed"
  | "outcome_recorded"
  | "outcome_timeout"
  | "cooldown_end"
  | "cooldown_skip"
  | "expire"
  | "block"
  | "cancel";

const TRANSITIONS: Record<ConnectionState, Partial<Record<ConnectionEvent, ConnectionState>>> = {
  WAITING_FOR_INITIATOR_SELFIE: {
    initiator_selfie: "WAITING_FOR_RECIPIENT_SELFIE",
    expire: "EXPIRED",
    block: "BLOCKED",
    cancel: "CANCELLED",
  },
  WAITING_FOR_RECIPIENT_SELFIE: {
    recipient_selfie: "WAITING_FOR_INITIATOR_APPROVAL",
    expire: "EXPIRED",
    block: "BLOCKED",
    cancel: "CANCELLED",
  },
  WAITING_FOR_INITIATOR_APPROVAL: {
    initiator_approve: "MUTUALLY_VALIDATED",
    expire: "EXPIRED",
    block: "BLOCKED",
    cancel: "CANCELLED",
  },
  MUTUALLY_VALIDATED: {
    meet_now: "MISSION_MEET_ACTIVE",
    hold_ticket: "TICKET_ACTIVE",
    block: "BLOCKED",
    cancel: "CANCELLED",
  },
  TICKET_ACTIVE: {
    ticket_available: "WAITING_FOR_TICKET_CONFIRMATION",
    expire: "EXPIRED",
    block: "BLOCKED",
    cancel: "CANCELLED",
  },
  WAITING_FOR_TICKET_CONFIRMATION: {
    ticket_confirm: "MISSION_MEET_ACTIVE",
    expire: "EXPIRED",
    block: "BLOCKED",
    cancel: "CANCELLED",
  },
  MISSION_MEET_ACTIVE: {
    lets_meet: "MISSION_CONFIRMED",
    not_this_time: "OUTCOME_PENDING",
    expire: "EXPIRED",
    block: "BLOCKED",
  },
  MISSION_CONFIRMED: {
    chat_closed: "OUTCOME_PENDING",
    expire: "OUTCOME_PENDING",
    block: "BLOCKED",
  },
  OUTCOME_PENDING: {
    outcome_recorded: "COOLDOWN_ACTIVE",
    outcome_timeout: "COOLDOWN_ACTIVE",
    block: "BLOCKED",
  },
  COOLDOWN_ACTIVE: {
    cooldown_end: "COMPLETED",
    cooldown_skip: "COMPLETED",
    block: "BLOCKED",
  },
  COMPLETED: {},
  EXPIRED: {},
  CANCELLED: {},
  BLOCKED: {},
  FAILED: {},
};

export function canTransition(from: ConnectionState, event: ConnectionEvent): boolean {
  return Boolean(TRANSITIONS[from]?.[event]);
}

export function transitionConnection(from: ConnectionState, event: ConnectionEvent): ConnectionState {
  const next = TRANSITIONS[from]?.[event];
  if (!next) {
    throw new DomainError(
      "FORBIDDEN_TRANSITION",
      `Connection cannot apply ${event} from ${from}`,
      { from, event },
    );
  }
  return next;
}

export function assertNotTerminal(state: ConnectionState): void {
  if (TERMINAL_CONNECTION_STATES.has(state)) {
    throw new DomainError("FORBIDDEN_TRANSITION", `Connection already terminal: ${state}`, { state });
  }
}

export function listAllowedEvents(from: ConnectionState): ConnectionEvent[] {
  return Object.keys(TRANSITIONS[from] ?? {}) as ConnectionEvent[];
}

export function allConnectionTransitions(): Array<{ from: ConnectionState; event: ConnectionEvent; to: ConnectionState }> {
  const out: Array<{ from: ConnectionState; event: ConnectionEvent; to: ConnectionState }> = [];
  for (const [from, map] of Object.entries(TRANSITIONS) as Array<[ConnectionState, Partial<Record<ConnectionEvent, ConnectionState>>]>) {
    for (const [event, to] of Object.entries(map) as Array<[ConnectionEvent, ConnectionState]>) {
      out.push({ from, event, to });
    }
  }
  return out;
}

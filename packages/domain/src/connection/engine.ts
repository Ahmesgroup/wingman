import type { Clock } from "../clock.js";
import { addMs } from "../clock.js";
import { DomainError } from "../errors.js";
import { pairParts } from "../pair.js";
import type { ConnectionState, DomainEvent, Entitlements, MissionResponse } from "../types.js";
import { WINDOWS_MS } from "../types.js";
import { transitionConnection, type ConnectionEvent } from "./transitions.js";

export interface ConnectionRecord {
  id: string;
  initiatorId: string;
  recipientId: string;
  pairKey: string;
  pairLowId: string;
  pairHighId: string;
  state: ConnectionState;
  isActive: boolean;
  startedAt: Date;
  expiresAt: Date;
  endedAt?: Date;
  failureReason?: string;
  purgeAt?: Date;
  initiatorSelfieMediaId?: string;
  recipientSelfieMediaId?: string;
  mutuallyValidatedAt?: Date;
  initiatorOutcome?: MissionResponse;
  recipientOutcome?: MissionResponse;
  metConfirmed?: boolean;
  cooldownSkipped?: boolean;
}

export interface CreateConnectionInput {
  id: string;
  initiatorId: string;
  recipientId: string;
  entitlements: Entitlements;
}

export function createConnectionFromAccept(input: CreateConnectionInput, clock: Clock): {
  connection: ConnectionRecord;
  events: DomainEvent[];
} {
  const now = clock.now();
  const parts = pairParts(input.initiatorId, input.recipientId);
  const connection: ConnectionRecord = {
    id: input.id,
    initiatorId: input.initiatorId,
    recipientId: input.recipientId,
    ...parts,
    state: "WAITING_FOR_INITIATOR_SELFIE",
    isActive: true,
    startedAt: now,
    expiresAt: addMs(now, input.entitlements.selfieWindowMs),
  };
  return {
    connection,
    events: [
      {
        type: "connection.created",
        at: now,
        payload: { connectionId: connection.id, state: connection.state },
        notify: true,
      },
    ],
  };
}

function finalizeTerminal(connection: ConnectionRecord, state: ConnectionState, now: Date, reason?: string): ConnectionRecord {
  return {
    ...connection,
    state,
    isActive: false,
    endedAt: now,
    failureReason: reason,
    purgeAt: addMs(now, WINDOWS_MS.PURGE_AFTER),
    expiresAt: now,
  };
}

export function applyConnectionEvent(
  connection: ConnectionRecord,
  event: ConnectionEvent,
  clock: Clock,
  opts: {
    entitlements: Entitlements;
    actorId: string;
    mediaId?: string;
    outcome?: MissionResponse;
    skipCooldown?: boolean;
  },
): { connection: ConnectionRecord; events: DomainEvent[]; releaseLocks: boolean } {
  const now = clock.now();
  const nextState = transitionConnection(connection.state, event);
  let next: ConnectionRecord = { ...connection, state: nextState };
  const events: DomainEvent[] = [];
  let releaseLocks = false;

  if (event === "initiator_selfie") {
    if (opts.actorId !== connection.initiatorId) {
      throw new DomainError("FORBIDDEN_TRANSITION", "Only initiator can send initiator selfie");
    }
    next.initiatorSelfieMediaId = opts.mediaId;
    next.expiresAt = addMs(now, opts.entitlements.selfieWindowMs);
  }

  if (event === "recipient_selfie") {
    if (opts.actorId !== connection.recipientId) {
      throw new DomainError("FORBIDDEN_TRANSITION", "Only recipient can send recipient selfie");
    }
    next.recipientSelfieMediaId = opts.mediaId;
    next.expiresAt = addMs(now, opts.entitlements.selfieWindowMs);
  }

  if (event === "initiator_approve") {
    if (opts.actorId !== connection.initiatorId) {
      throw new DomainError("FORBIDDEN_TRANSITION", "Only initiator can approve");
    }
    if (!connection.initiatorSelfieMediaId || !connection.recipientSelfieMediaId) {
      throw new DomainError("VALIDATION_REQUIRED", "Both selfies required before approval");
    }
    next.mutuallyValidatedAt = now;
    next.expiresAt = addMs(now, opts.entitlements.missionMeetDurationMs);
  }

  if (event === "meet_now" || event === "ticket_confirm") {
    next.expiresAt = addMs(now, opts.entitlements.missionMeetDurationMs);
  }

  if (event === "hold_ticket") {
    next.expiresAt = addMs(now, opts.entitlements.ticketMaxDurationMs);
  }

  if (event === "ticket_available") {
    next.expiresAt = addMs(now, WINDOWS_MS.TICKET_CONFIRM);
  }

  if (event === "lets_meet" || event === "not_this_time" || event === "chat_closed") {
    next.initiatorOutcome = next.initiatorOutcome ?? "PENDING";
    next.recipientOutcome = next.recipientOutcome ?? "PENDING";
  }

  if (event === "outcome_recorded") {
    if (opts.actorId === connection.initiatorId) {
      next.initiatorOutcome = opts.outcome ?? "YES";
    } else if (opts.actorId === connection.recipientId) {
      next.recipientOutcome = opts.outcome ?? "YES";
    } else {
      throw new DomainError("FORBIDDEN_TRANSITION", "Actor not in connection");
    }
    const both =
      next.initiatorOutcome &&
      next.recipientOutcome &&
      next.initiatorOutcome !== "PENDING" &&
      next.recipientOutcome !== "PENDING";
    if (!both) {
      // stay pending until both answer — revert transition if incomplete
      throw new DomainError("VALIDATION_REQUIRED", "Waiting for both outcomes", { partial: true });
    }
    next.metConfirmed = next.initiatorOutcome === "YES" && next.recipientOutcome === "YES";
    const cooldownMs =
      next.initiatorOutcome === "YES" || next.recipientOutcome === "YES"
        ? WINDOWS_MS.COOLDOWN_YES
        : WINDOWS_MS.COOLDOWN_NO;
    next.expiresAt = addMs(now, cooldownMs);
  }

  if (event === "outcome_timeout") {
    next.initiatorOutcome = next.initiatorOutcome === "PENDING" || !next.initiatorOutcome ? "TIMEOUT" : next.initiatorOutcome;
    next.recipientOutcome = next.recipientOutcome === "PENDING" || !next.recipientOutcome ? "TIMEOUT" : next.recipientOutcome;
    next.metConfirmed = false;
    next.expiresAt = addMs(now, WINDOWS_MS.COOLDOWN_NO);
  }

  if (event === "cooldown_skip") {
    next.cooldownSkipped = true;
  }

  if (["EXPIRED", "CANCELLED", "BLOCKED", "FAILED", "COMPLETED"].includes(nextState)) {
    const reason =
      nextState === "EXPIRED"
        ? "WINDOW_ELAPSED"
        : nextState === "BLOCKED"
          ? "BLOCKED"
          : nextState === "CANCELLED"
            ? "CANCELLED"
            : undefined;
    next = finalizeTerminal(next, nextState, now, reason);
    releaseLocks = true;
    events.push({
      type: `connection.${nextState.toLowerCase()}`,
      at: now,
      payload: { connectionId: next.id, state: next.state },
      notify: nextState !== "EXPIRED",
    });
  } else {
    events.push({
      type: "connection.state_changed",
      at: now,
      payload: { connectionId: next.id, from: connection.state, to: next.state },
      notify: true,
    });
  }

  return { connection: next, events, releaseLocks };
}

/** Record one party's outcome; transitions to COOLDOWN only when both answered. */
export function recordMissionOutcome(
  connection: ConnectionRecord,
  actorId: string,
  outcome: MissionResponse,
  clock: Clock,
  entitlements: Entitlements,
): { connection: ConnectionRecord; events: DomainEvent[]; releaseLocks: boolean; completedPair: boolean } {
  if (connection.state !== "OUTCOME_PENDING") {
    throw new DomainError("FORBIDDEN_TRANSITION", `Cannot record outcome in ${connection.state}`);
  }
  const now = clock.now();
  const next: ConnectionRecord = { ...connection };
  if (actorId === connection.initiatorId) next.initiatorOutcome = outcome;
  else if (actorId === connection.recipientId) next.recipientOutcome = outcome;
  else throw new DomainError("FORBIDDEN_TRANSITION", "Actor not in connection");

  const i = next.initiatorOutcome;
  const r = next.recipientOutcome;
  const bothDone = i && r && i !== "PENDING" && r !== "PENDING";
  if (!bothDone) {
    return {
      connection: next,
      events: [{ type: "connection.outcome_partial", at: now, payload: { connectionId: next.id }, notify: false }],
      releaseLocks: false,
      completedPair: false,
    };
  }
  next.metConfirmed = i === "YES" && r === "YES";
  const cooldownMs = i === "YES" || r === "YES" ? WINDOWS_MS.COOLDOWN_YES : WINDOWS_MS.COOLDOWN_NO;
  next.state = "COOLDOWN_ACTIVE";
  next.expiresAt = addMs(now, cooldownMs);
  return {
    connection: next,
    events: [
      {
        type: "connection.state_changed",
        at: now,
        payload: { connectionId: next.id, to: "COOLDOWN_ACTIVE", metConfirmed: next.metConfirmed },
        notify: true,
      },
    ],
    releaseLocks: false,
    completedPair: true,
  };
}

export function expireConnectionIfNeeded(
  connection: ConnectionRecord,
  clock: Clock,
  entitlements: Entitlements,
): { connection: ConnectionRecord; events: DomainEvent[]; releaseLocks: boolean } | null {
  if (!connection.isActive) return null;
  if (clock.now().getTime() < connection.expiresAt.getTime()) return null;
  if (connection.state === "OUTCOME_PENDING") {
    return applyConnectionEvent(connection, "outcome_timeout", clock, {
      entitlements,
      actorId: connection.initiatorId,
    });
  }
  if (connection.state === "COOLDOWN_ACTIVE") {
    return applyConnectionEvent(connection, "cooldown_end", clock, {
      entitlements,
      actorId: connection.initiatorId,
    });
  }
  if (connection.state === "MISSION_CONFIRMED") {
    return applyConnectionEvent(connection, "chat_closed", clock, {
      entitlements,
      actorId: connection.initiatorId,
    });
  }
  return applyConnectionEvent(connection, "expire", clock, {
    entitlements,
    actorId: connection.initiatorId,
  });
}

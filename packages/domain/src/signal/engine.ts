import type { Clock } from "../clock.js";
import { addMs, toUtcDayKey } from "../clock.js";
import { DomainError } from "../errors.js";
import { pairKey } from "../pair.js";
import type { DomainEvent, Entitlements, SignalSource, SignalStatus } from "../types.js";
import { ACTIVE_SIGNAL_STATUSES, WINDOWS_MS } from "../types.js";

export interface SignalRecord {
  id: string;
  pairKey: string;
  senderId: string;
  receiverId: string;
  source: SignalSource;
  status: SignalStatus;
  isActive: boolean;
  createdAt: Date;
  openedAt?: Date;
  acceptedAt?: Date;
  expiresAt: Date;
  closedAt?: Date;
}

export interface CreateSignalCommand {
  id: string;
  senderId: string;
  receiverId: string;
  source?: SignalSource;
  entitlements: Entitlements;
  signalsUsedToday: number;
  hasActivePairSignal: boolean;
  isBlockedEitherWay: boolean;
  senderLocked: boolean;
  receiverLocked: boolean;
}

export function createSignal(cmd: CreateSignalCommand, clock: Clock): { signal: SignalRecord; events: DomainEvent[] } {
  if (cmd.senderId === cmd.receiverId) {
    throw new DomainError("SIGNAL_SELF", "Cannot signal yourself");
  }
  if (cmd.isBlockedEitherWay) {
    throw new DomainError("SIGNAL_BLOCKED", "Pair is blocked");
  }
  if (cmd.hasActivePairSignal) {
    throw new DomainError("SIGNAL_PAIR_ACTIVE", "Active signal already exists for pair");
  }
  if (cmd.senderLocked || cmd.receiverLocked) {
    throw new DomainError("USER_LOCKED", "User already in active connection");
  }
  if (cmd.signalsUsedToday >= cmd.entitlements.signalDailyLimit) {
    throw new DomainError("SIGNAL_QUOTA_EXCEEDED", "Daily signal quota exceeded", {
      used: cmd.signalsUsedToday,
      limit: cmd.entitlements.signalDailyLimit,
      windowKey: toUtcDayKey(clock.now()),
    });
  }

  const now = clock.now();
  const signal: SignalRecord = {
    id: cmd.id,
    pairKey: pairKey(cmd.senderId, cmd.receiverId),
    senderId: cmd.senderId,
    receiverId: cmd.receiverId,
    source: cmd.source ?? "RADAR",
    status: "PENDING",
    isActive: true,
    createdAt: now,
    expiresAt: addMs(now, WINDOWS_MS.SIGNAL),
  };

  return {
    signal,
    events: [
      {
        type: "signal.received",
        at: now,
        payload: { signalId: signal.id, receiverId: signal.receiverId },
        notify: true,
      },
    ],
  };
}

export function openSignal(signal: SignalRecord, actorId: string, clock: Clock): SignalRecord {
  assertActiveSignal(signal, clock);
  if (actorId !== signal.receiverId) {
    throw new DomainError("SIGNAL_NOT_RECIPIENT", "Only recipient can open signal");
  }
  if (signal.status === "OPENED") return signal;
  if (signal.status !== "PENDING") {
    throw new DomainError("FORBIDDEN_TRANSITION", `Cannot open signal in ${signal.status}`);
  }
  return { ...signal, status: "OPENED", openedAt: clock.now() };
}

export function cancelSignal(signal: SignalRecord, actorId: string, clock: Clock): { signal: SignalRecord; events: DomainEvent[] } {
  assertActiveSignal(signal, clock);
  if (actorId !== signal.senderId) {
    throw new DomainError("SIGNAL_NOT_SENDER", "Only sender can cancel");
  }
  const now = clock.now();
  return {
    signal: { ...signal, status: "CANCELLED", isActive: false, closedAt: now },
    events: [{ type: "signal.cancelled", at: now, payload: { signalId: signal.id }, notify: false }],
  };
}

export function refuseSignal(signal: SignalRecord, actorId: string, clock: Clock): { signal: SignalRecord; events: DomainEvent[] } {
  assertActiveSignal(signal, clock);
  if (actorId !== signal.receiverId) {
    throw new DomainError("SIGNAL_NOT_RECIPIENT", "Only recipient can refuse");
  }
  const now = clock.now();
  // Product: silent decline — close without rejection notification to sender
  return {
    signal: { ...signal, status: "CANCELLED", isActive: false, closedAt: now },
    events: [{ type: "signal.refused", at: now, payload: { signalId: signal.id }, notify: false }],
  };
}

export function blockSignal(signal: SignalRecord, clock: Clock): { signal: SignalRecord; events: DomainEvent[] } {
  if (!signal.isActive) return { signal, events: [] };
  const now = clock.now();
  return {
    signal: { ...signal, status: "BLOCKED", isActive: false, closedAt: now },
    events: [{ type: "signal.blocked", at: now, payload: { signalId: signal.id }, notify: false }],
  };
}

export function expireSignal(signal: SignalRecord, clock: Clock): { signal: SignalRecord; events: DomainEvent[] } | null {
  if (!signal.isActive) return null;
  if (clock.now().getTime() < signal.expiresAt.getTime()) return null;
  const now = clock.now();
  return {
    signal: { ...signal, status: "EXPIRED", isActive: false, closedAt: now },
    events: [
      {
        type: "signal.expired",
        at: now,
        payload: { signalId: signal.id },
        notify: false, // silent expiry invariant
      },
    ],
  };
}

export function markSignalAccepted(signal: SignalRecord, actorId: string, clock: Clock): SignalRecord {
  assertActiveSignal(signal, clock);
  if (actorId !== signal.receiverId) {
    throw new DomainError("SIGNAL_NOT_RECIPIENT", "Only recipient can accept");
  }
  if (!ACTIVE_SIGNAL_STATUSES.has(signal.status)) {
    throw new DomainError("FORBIDDEN_TRANSITION", `Cannot accept signal in ${signal.status}`);
  }
  const now = clock.now();
  return {
    ...signal,
    status: "ACCEPTED",
    isActive: false,
    acceptedAt: now,
    closedAt: now,
  };
}

function assertActiveSignal(signal: SignalRecord, clock: Clock): void {
  if (!signal.isActive || !ACTIVE_SIGNAL_STATUSES.has(signal.status)) {
    throw new DomainError("SIGNAL_NOT_FOUND", "Signal is not active");
  }
  if (clock.now().getTime() >= signal.expiresAt.getTime()) {
    throw new DomainError("SIGNAL_EXPIRED", "Signal expired");
  }
}

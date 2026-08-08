import { REALTIME_ENVELOPE_VERSION, type RealtimeEnvelope, type RealtimeEventType } from "./types.js";

/** Monotonic event ids: `${ms}-${seq}` sortable lexicographically within a process. */
export class EventIdFactory {
  private seq = 0;
  private lastMs = 0;

  next(now = Date.now()): string {
    if (now <= this.lastMs) {
      this.seq += 1;
    } else {
      this.lastMs = now;
      this.seq = 0;
    }
    return `${this.lastMs}-${String(this.seq).padStart(6, "0")}`;
  }
}

export function createEnvelope(input: {
  type: RealtimeEventType;
  aggregateId: string;
  rooms: string[];
  payload: Record<string, unknown>;
  occurredAt?: Date;
  eventId?: string;
  ids?: EventIdFactory;
}): RealtimeEnvelope {
  const occurredAt = input.occurredAt ?? new Date();
  const ids = input.ids ?? new EventIdFactory();
  return {
    eventId: input.eventId ?? ids.next(occurredAt.getTime()),
    type: input.type,
    occurredAt: occurredAt.toISOString(),
    aggregateId: input.aggregateId,
    version: REALTIME_ENVELOPE_VERSION,
    payload: input.payload,
    rooms: [...new Set(input.rooms)],
  };
}

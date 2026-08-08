import type { RealtimeEnvelope } from "./types.js";

/**
 * Short in-memory replay window per room.
 * Radar/presence should use snapshots instead of relying on this buffer.
 */
export class ReplayBuffer {
  private readonly byRoom = new Map<string, RealtimeEnvelope[]>();

  constructor(private readonly maxPerRoom = 100) {}

  append(envelope: RealtimeEnvelope): void {
    for (const room of envelope.rooms) {
      const list = this.byRoom.get(room) ?? [];
      list.push(envelope);
      while (list.length > this.maxPerRoom) list.shift();
      this.byRoom.set(room, list);
    }
  }

  /** Events strictly after lastEventId for the given rooms (sorted by eventId). */
  since(lastEventId: string | undefined, rooms: string[]): RealtimeEnvelope[] {
    const seen = new Set<string>();
    const out: RealtimeEnvelope[] = [];
    for (const room of rooms) {
      for (const ev of this.byRoom.get(room) ?? []) {
        if (lastEventId && ev.eventId <= lastEventId) continue;
        if (seen.has(ev.eventId)) continue;
        seen.add(ev.eventId);
        out.push(ev);
      }
    }
    out.sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
    return out;
  }

  clear(): void {
    this.byRoom.clear();
  }
}

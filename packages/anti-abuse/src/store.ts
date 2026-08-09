import type { AbuseEvent, ActiveSanction } from "./types.js";

export interface AbuseStateStore {
  appendEvent(event: AbuseEvent): void;
  /** Events for actor in [since, now], newest last */
  listEvents(actorId: string, since: Date, now: Date): AbuseEvent[];
  /** True if this event id was already observed (replay guard) */
  hasEventId(id: string): boolean;
  getSanction(userId: string, now: Date): ActiveSanction | undefined;
  setSanction(sanction: ActiveSanction): void;
  clearSanction(userId: string): void;
  /** All non-expired sanctions (audit / multi-instance shared store) */
  listSanctions(now: Date): ActiveSanction[];
}

export class MemoryAbuseStateStore implements AbuseStateStore {
  private events: AbuseEvent[] = [];
  private eventIds = new Set<string>();
  private sanctions = new Map<string, ActiveSanction>();

  appendEvent(event: AbuseEvent): void {
    if (this.eventIds.has(event.id)) return;
    this.eventIds.add(event.id);
    this.events.push(event);
    // Bound memory: keep last 5k
    if (this.events.length > 5000) {
      const dropped = this.events.splice(0, this.events.length - 5000);
      for (const d of dropped) this.eventIds.delete(d.id);
    }
  }

  listEvents(actorId: string, since: Date, now: Date): AbuseEvent[] {
    const t0 = since.getTime();
    const t1 = now.getTime();
    return this.events.filter(
      (e) => e.actorId === actorId && e.at.getTime() >= t0 && e.at.getTime() <= t1,
    );
  }

  hasEventId(id: string): boolean {
    return this.eventIds.has(id);
  }

  getSanction(userId: string, now: Date): ActiveSanction | undefined {
    const s = this.sanctions.get(userId);
    if (!s) return undefined;
    if (now.getTime() >= s.expiresAt.getTime()) {
      this.sanctions.delete(userId);
      return undefined;
    }
    return s;
  }

  setSanction(sanction: ActiveSanction): void {
    this.sanctions.set(sanction.userId, sanction);
  }

  clearSanction(userId: string): void {
    this.sanctions.delete(userId);
  }

  listSanctions(now: Date): ActiveSanction[] {
    const out: ActiveSanction[] = [];
    for (const userId of [...this.sanctions.keys()]) {
      const s = this.getSanction(userId, now);
      if (s) out.push(s);
    }
    return out;
  }
}

import type { EphemeralStore, GeoPoint, PresenceSnapshot } from "./types.js";

/** In-memory ephemeral store for tests / single-instance. */
export class MemoryEphemeralStore implements EphemeralStore {
  presence = new Map<string, PresenceSnapshot>();
  locks = new Map<string, { owner: string; expiresAt: number }>();
  quotas = new Map<string, { count: number; expiresAt: number }>();
  subs = new Map<string, Set<(p: string) => void>>();

  async setPresence(p: PresenceSnapshot, _ttlSeconds: number): Promise<void> {
    this.presence.set(p.userId, p);
  }

  async getPresence(userId: string): Promise<PresenceSnapshot | null> {
    const p = this.presence.get(userId);
    if (!p) return null;
    if (Date.now() >= p.expiresAtMs) {
      this.presence.delete(userId);
      return null;
    }
    return p;
  }

  async heartbeat(userId: string, ttlSeconds: number, location?: GeoPoint): Promise<PresenceSnapshot | null> {
    const p = await this.getPresence(userId);
    if (!p) return null;
    const next = {
      ...p,
      expiresAtMs: Date.now() + ttlSeconds * 1000,
      location: location ?? p.location,
    };
    this.presence.set(userId, next);
    return next;
  }

  async deletePresence(userId: string): Promise<void> {
    this.presence.delete(userId);
  }

  async acquireLock(key: string, owner: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(key);
    if (existing && existing.expiresAt > now && existing.owner !== owner) return false;
    this.locks.set(key, { owner, expiresAt: now + ttlSeconds * 1000 });
    return true;
  }

  async releaseLock(key: string, owner: string): Promise<void> {
    const existing = this.locks.get(key);
    if (existing?.owner === owner) this.locks.delete(key);
  }

  async incrQuota(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const cur = this.quotas.get(key);
    if (!cur || cur.expiresAt <= now) {
      this.quotas.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    cur.count += 1;
    return cur.count;
  }

  async publish(channel: string, payload: string): Promise<void> {
    for (const h of this.subs.get(channel) ?? []) h(payload);
  }

  async subscribe(channel: string, handler: (payload: string) => void): Promise<() => Promise<void>> {
    if (!this.subs.has(channel)) this.subs.set(channel, new Set());
    this.subs.get(channel)!.add(handler);
    return async () => {
      this.subs.get(channel)?.delete(handler);
    };
  }
}

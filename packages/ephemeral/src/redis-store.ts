import { Redis } from "ioredis";
import type { EphemeralStore, GeoPoint, PresenceSnapshot } from "./types.js";

export class RedisEphemeralStore implements EphemeralStore {
  constructor(
    private readonly redis: Redis,
    private readonly sub: Redis,
  ) {}

  static fromUrl(url: string): RedisEphemeralStore {
    const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    const sub = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    return new RedisEphemeralStore(redis, sub);
  }

  async connect(): Promise<void> {
    if (this.redis.status !== "ready") await this.redis.connect();
    if (this.sub.status !== "ready") await this.sub.connect();
  }

  private presenceKey(userId: string): string {
    return `presence:${userId}`;
  }

  async setPresence(p: PresenceSnapshot, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.presenceKey(p.userId), JSON.stringify(p), "EX", ttlSeconds);
    if (p.location) {
      await this.redis.geoadd("radar:geo", p.location.lng, p.location.lat, p.userId);
    }
  }

  async getPresence(userId: string): Promise<PresenceSnapshot | null> {
    const raw = await this.redis.get(this.presenceKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as PresenceSnapshot;
  }

  async heartbeat(userId: string, ttlSeconds: number, location?: GeoPoint): Promise<PresenceSnapshot | null> {
    const p = await this.getPresence(userId);
    if (!p) return null;
    const next = {
      ...p,
      expiresAtMs: Date.now() + ttlSeconds * 1000,
      location: location ?? p.location,
    };
    await this.setPresence(next, ttlSeconds);
    return next;
  }

  async deletePresence(userId: string): Promise<void> {
    await this.redis.del(this.presenceKey(userId));
    await this.redis.zrem("radar:geo", userId);
  }

  async acquireLock(key: string, owner: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.redis.set(`lock:${key}`, owner, "EX", ttlSeconds, "NX");
    return res === "OK";
  }

  async releaseLock(key: string, owner: string): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end`;
    await this.redis.eval(script, 1, `lock:${key}`, owner);
  }

  async incrQuota(key: string, ttlSeconds: number): Promise<number> {
    const k = `quota:${key}`;
    const n = await this.redis.incr(k);
    if (n === 1) await this.redis.expire(k, ttlSeconds);
    return n;
  }

  async publish(channel: string, payload: string): Promise<void> {
    await this.redis.publish(channel, payload);
  }

  async subscribe(channel: string, handler: (payload: string) => void): Promise<() => Promise<void>> {
    const listener = (ch: string, message: string) => {
      if (ch === channel) handler(message);
    };
    this.sub.on("message", listener);
    await this.sub.subscribe(channel);
    return async () => {
      this.sub.off("message", listener);
      await this.sub.unsubscribe(channel);
    };
  }
}

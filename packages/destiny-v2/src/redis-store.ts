import { Redis } from "ioredis";
import type { DestinyProposal } from "./types.js";
import {
  isOpenStatus,
  proposalFromWire,
  proposalToWire,
  type DestinyProposalStore,
  type DestinyProposalWire,
} from "./store.js";

const PREFIX = "destiny:v2";

/**
 * Redis-backed Destiny proposal store (S24.1).
 * Ephemeral consent objects — not Postgres protocol hydrate.
 */
export class RedisDestinyProposalStore implements DestinyProposalStore {
  constructor(private readonly redis: Redis) {}

  static fromUrl(url: string): RedisDestinyProposalStore {
    const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    return new RedisDestinyProposalStore(redis);
  }

  async connect(): Promise<void> {
    if (this.redis.status !== "ready") await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    if (this.redis.status !== "end") await this.redis.quit();
  }

  private propKey(id: string): string {
    return `${PREFIX}:proposal:${id}`;
  }

  private pairKey(pairKey: string): string {
    return `${PREFIX}:activePair:${pairKey}`;
  }

  private userKey(userId: string): string {
    return `${PREFIX}:user:${userId}`;
  }

  private indexKey(): string {
    return `${PREFIX}:index`;
  }

  private ttlSeconds(p: DestinyProposal): number {
    const remain = Math.ceil((p.expiresAt.getTime() - Date.now()) / 1000);
    // Keep terminal records briefly for handoff / client reconcile
    if (!isOpenStatus(p.status)) return Math.max(remain, 3600);
    return Math.max(remain, 60);
  }

  async get(id: string): Promise<DestinyProposal | undefined> {
    const raw = await this.redis.get(this.propKey(id));
    if (!raw) return undefined;
    return proposalFromWire(JSON.parse(raw) as DestinyProposalWire);
  }

  async getActiveByPair(pairKey: string): Promise<DestinyProposal | undefined> {
    const id = await this.redis.get(this.pairKey(pairKey));
    if (!id) return undefined;
    const p = await this.get(id);
    if (!p || !isOpenStatus(p.status)) {
      await this.redis.del(this.pairKey(pairKey));
      return undefined;
    }
    return p;
  }

  async listByUser(userId: string): Promise<DestinyProposal[]> {
    const ids = await this.redis.smembers(this.userKey(userId));
    const out: DestinyProposal[] = [];
    for (const id of ids) {
      const p = await this.get(id);
      if (p) out.push(p);
      else await this.redis.srem(this.userKey(userId), id);
    }
    return out;
  }

  async listActiveByUser(userId: string): Promise<DestinyProposal[]> {
    return (await this.listByUser(userId)).filter((p) => isOpenStatus(p.status));
  }

  async upsert(p: DestinyProposal): Promise<void> {
    const key = this.propKey(p.id);
    const ttl = this.ttlSeconds(p);
    const pipe = this.redis.pipeline();
    pipe.set(key, JSON.stringify(proposalToWire(p)), "EX", ttl);
    pipe.sadd(this.indexKey(), p.id);
    pipe.sadd(this.userKey(p.userA), p.id);
    pipe.sadd(this.userKey(p.userB), p.id);
    pipe.expire(this.userKey(p.userA), Math.max(ttl, 3600));
    pipe.expire(this.userKey(p.userB), Math.max(ttl, 3600));
    if (isOpenStatus(p.status)) {
      pipe.set(this.pairKey(p.pairKey), p.id, "EX", ttl);
    } else {
      pipe.del(this.pairKey(p.pairKey));
    }
    await pipe.exec();
  }

  async listAll(): Promise<DestinyProposal[]> {
    const ids = await this.redis.smembers(this.indexKey());
    const out: DestinyProposal[] = [];
    for (const id of ids) {
      const p = await this.get(id);
      if (p) out.push(p);
      else await this.redis.srem(this.indexKey(), id);
    }
    return out;
  }
}

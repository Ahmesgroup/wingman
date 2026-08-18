export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  refreshHash: string;
  deviceId: string;
  createdAt: Date;
  expiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt?: Date;
}

export interface AuthKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface AuthPersistence {
  getUserId(phoneLookup: string): Promise<string | null>;
  putUserId(phoneLookup: string, userId: string): Promise<void>;
  getByAccessHash(hash: string): Promise<Session | null>;
  getByRefreshHash(hash: string): Promise<Session | null>;
  putSession(session: Session, accessTtlSec?: number, refreshTtlSec?: number): Promise<void>;
  dropSession(session: Session): Promise<void>;
}

function phoneKey(lookup: string): string {
  return `auth:phone:${lookup}`;
}
function accessKey(hash: string): string {
  return `auth:access:${hash}`;
}
function refreshKey(hash: string): string {
  return `auth:refresh:${hash}`;
}

const PHONE_TTL_SEC = 400 * 24 * 60 * 60;

function encodeSession(session: Session): string {
  return JSON.stringify({
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    refreshHash: session.refreshHash,
    deviceId: session.deviceId,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    refreshExpiresAt: session.refreshExpiresAt.toISOString(),
    revokedAt: session.revokedAt ? session.revokedAt.toISOString() : undefined,
  });
}

function decodeSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, string>;
    if (!o.id || !o.userId || !o.tokenHash || !o.refreshHash || !o.deviceId) return null;
    return {
      id: o.id,
      userId: o.userId,
      tokenHash: o.tokenHash,
      refreshHash: o.refreshHash,
      deviceId: o.deviceId,
      createdAt: new Date(o.createdAt),
      expiresAt: new Date(o.expiresAt),
      refreshExpiresAt: new Date(o.refreshExpiresAt),
      revokedAt: o.revokedAt ? new Date(o.revokedAt) : undefined,
    };
  } catch {
    return null;
  }
}

/** In-process store — tests / local without Redis. Not durable across Vercel isolates. */
export class MemoryAuthPersistence implements AuthPersistence {
  private users = new Map<string, string>();
  private byAccess = new Map<string, Session>();
  private byRefresh = new Map<string, Session>();

  async getUserId(phoneLookup: string): Promise<string | null> {
    return this.users.get(phoneLookup) ?? null;
  }
  async putUserId(phoneLookup: string, userId: string): Promise<void> {
    this.users.set(phoneLookup, userId);
  }
  async getByAccessHash(hash: string): Promise<Session | null> {
    return this.byAccess.get(hash) ?? null;
  }
  async getByRefreshHash(hash: string): Promise<Session | null> {
    return this.byRefresh.get(hash) ?? null;
  }
  async putSession(session: Session): Promise<void> {
    this.byAccess.set(session.tokenHash, session);
    this.byRefresh.set(session.refreshHash, session);
  }
  async dropSession(session: Session): Promise<void> {
    this.byAccess.delete(session.tokenHash);
    this.byRefresh.delete(session.refreshHash);
  }
}

/** Redis (or any KV) — survives serverless cold starts. Phone lookup has a long TTL, tokens follow session/refresh TTLs. */
export class KvAuthPersistence implements AuthPersistence {
  constructor(private readonly kv: AuthKv) {}

  async getUserId(phoneLookup: string): Promise<string | null> {
    return this.kv.get(phoneKey(phoneLookup));
  }
  async putUserId(phoneLookup: string, userId: string): Promise<void> {
    await this.kv.set(phoneKey(phoneLookup), userId, PHONE_TTL_SEC);
  }
  async getByAccessHash(hash: string): Promise<Session | null> {
    return decodeSession(await this.kv.get(accessKey(hash)));
  }
  async getByRefreshHash(hash: string): Promise<Session | null> {
    return decodeSession(await this.kv.get(refreshKey(hash)));
  }
  async putSession(session: Session, accessTtlSec: number, refreshTtlSec: number): Promise<void> {
    const raw = encodeSession(session);
    await this.kv.set(accessKey(session.tokenHash), raw, Math.max(1, accessTtlSec));
    await this.kv.set(refreshKey(session.refreshHash), raw, Math.max(1, refreshTtlSec));
  }
  async dropSession(session: Session): Promise<void> {
    await this.kv.del(accessKey(session.tokenHash));
    await this.kv.del(refreshKey(session.refreshHash));
  }
}

export function redisAuthKv(redis: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...rest: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
}): AuthKv {
  return {
    get: (key) => redis.get(key),
    set: async (key, value, ttlSeconds) => {
      if (ttlSeconds && ttlSeconds > 0) await redis.set(key, value, "EX", ttlSeconds);
      else await redis.set(key, value);
    },
    del: async (key) => {
      await redis.del(key);
    },
  };
}

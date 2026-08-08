export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface PresenceSnapshot {
  userId: string;
  visibility: string;
  online: boolean;
  expiresAtMs: number;
  location?: GeoPoint;
}

export interface EphemeralStore {
  setPresence(p: PresenceSnapshot, ttlSeconds: number): Promise<void>;
  getPresence(userId: string): Promise<PresenceSnapshot | null>;
  heartbeat(userId: string, ttlSeconds: number, location?: GeoPoint): Promise<PresenceSnapshot | null>;
  deletePresence(userId: string): Promise<void>;
  acquireLock(key: string, owner: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(key: string, owner: string): Promise<void>;
  incrQuota(key: string, ttlSeconds: number): Promise<number>;
  publish(channel: string, payload: string): Promise<void>;
  subscribe(channel: string, handler: (payload: string) => void): Promise<() => Promise<void>>;
}

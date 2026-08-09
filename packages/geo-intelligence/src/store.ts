import type { GeoInternalRecord } from "./types.js";

export interface GeoSnapshotStore {
  get(userId: string): GeoInternalRecord | undefined;
  upsert(record: GeoInternalRecord): void;
  delete(userId: string): void;
  /** Non-expired records (caller passes now filter) */
  listAll(): GeoInternalRecord[];
}

/**
 * Process-local / injectable store. Only current snapshot per user — no trajectory list.
 * Multi-instance: share the same store instance (tests) or later Redis adapter.
 */
export class MemoryGeoSnapshotStore implements GeoSnapshotStore {
  private byUser = new Map<string, GeoInternalRecord>();

  get(userId: string): GeoInternalRecord | undefined {
    return this.byUser.get(userId);
  }

  upsert(record: GeoInternalRecord): void {
    this.byUser.set(record.userId, record);
  }

  delete(userId: string): void {
    this.byUser.delete(userId);
  }

  listAll(): GeoInternalRecord[] {
    return [...this.byUser.values()];
  }
}

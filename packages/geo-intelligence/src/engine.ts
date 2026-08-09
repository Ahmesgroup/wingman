import {
  adaptiveRadii,
  classifyDensity,
  classifyFreshness,
  classifyMovement,
  freshnessConfidence,
} from "./policy.js";
import {
  approxDeltaMeters,
  bandFromMeters,
  distanceMetersInternal,
  quantizePoint,
  spatialCellId,
  withPolicy,
} from "./normalize.js";
import type { GeoSnapshotStore } from "./store.js";
import type {
  GeoContextPort,
  GeoContextView,
  GeoInternalRecord,
  GeoPairView,
  GeoPolicyConfig,
} from "./types.js";
import { GEO_ENGINE, GEO_VERSION } from "./types.js";

export interface IngestResult {
  view: GeoContextView;
  /** Coarse delta for anti-abuse only — never lat/lng */
  approxDeltaM?: number;
  /** Quantized point for ephemeral presence — still not for HTTP */
  quantized: { lat: number; lng: number };
  audit: { engine: typeof GEO_ENGINE; version: typeof GEO_VERSION };
}

/**
 * Geo Intelligence facade — spatial relevance, not tracking.
 * Consumers must use GeoContextPort; never read internal points.
 */
export class GeoIntelligenceEngine implements GeoContextPort {
  constructor(
    private readonly store: GeoSnapshotStore,
    private readonly policy: GeoPolicyConfig = withPolicy(),
    private readonly adaptiveEnabled: boolean = false,
  ) {}

  getStore(): GeoSnapshotStore {
    return this.store;
  }

  /**
   * Ingest device lat/lng → ephemeral spatial snapshot.
   * Expired previous samples are ignored for movement (no ghost location).
   */
  ingest(userId: string, lat: number, lng: number, now: Date): IngestResult {
    const quantized = quantizePoint(lat, lng, this.policy.quantizeDecimals);
    const cell = spatialCellId(quantized, this.policy.cellStep);
    const existing = this.store.get(userId);

    let movement = classifyMovement(undefined, this.policy);
    let approxDeltaM: number | undefined;
    let prevPoint = existing?.point;
    let prevAt = existing?.capturedAt;

    // Ghost guard: ignore previous if expired or gap too large
    if (existing) {
      const gap = now.getTime() - existing.capturedAt.getTime();
      const expired = now.getTime() >= existing.expiresAt.getTime();
      if (expired || gap > this.policy.movementMaxGapMs) {
        prevPoint = undefined;
        prevAt = undefined;
      } else if (prevPoint && prevAt) {
        const dist = distanceMetersInternal(prevPoint, quantized);
        const dtSec = Math.max(0.001, (now.getTime() - prevAt.getTime()) / 1000);
        movement = classifyMovement(dist / dtSec, this.policy);
        approxDeltaM = approxDeltaMeters(prevPoint, quantized);
      }
    }

    // Density from other non-expired users in same cell (exclude self)
    const peers = this.store
      .listAll()
      .filter(
        (r) =>
          r.userId !== userId &&
          r.spatialCell === cell &&
          now.getTime() < r.expiresAt.getTime(),
      );
    const density = classifyDensity(peers.length + 1, this.policy);
    const freshness = classifyFreshness(0, this.policy);
    const confidence = freshnessConfidence(freshness);
    const radii = adaptiveRadii(density, movement, freshness, this.policy, this.adaptiveEnabled);

    const record: GeoInternalRecord = {
      userId,
      point: quantized,
      spatialCell: cell,
      density,
      freshness,
      movement,
      confidence,
      capturedAt: now,
      expiresAt: new Date(now.getTime() + this.policy.snapshotTtlMs),
      recommendedNearM: radii.nearM,
      recommendedAroundM: radii.aroundM,
    };
    this.store.upsert(record);

    return {
      view: this.toView(record),
      approxDeltaM,
      quantized,
      audit: { engine: GEO_ENGINE, version: GEO_VERSION },
    };
  }

  clear(userId: string): void {
    this.store.delete(userId);
  }

  forUser(userId: string, now: Date): GeoContextView | undefined {
    const rec = this.refreshRecord(userId, now);
    if (!rec || rec.freshness === "EXPIRED") return undefined;
    return this.toView(rec);
  }

  forPair(viewerId: string, otherId: string, now: Date): GeoPairView | undefined {
    const a = this.refreshRecord(viewerId, now);
    const b = this.refreshRecord(otherId, now);
    if (!a || !b || a.freshness === "EXPIRED" || b.freshness === "EXPIRED") return undefined;
    const meters = distanceMetersInternal(a.point, b.point);
    const near = this.adaptiveEnabled ? a.recommendedNearM : this.policy.nearM;
    const around = this.adaptiveEnabled ? a.recommendedAroundM : this.policy.aroundM;
    return {
      distanceBand: bandFromMeters(meters, near, around),
      sameCell: a.spatialCell === b.spatialCell,
    };
  }

  private refreshRecord(userId: string, now: Date): GeoInternalRecord | undefined {
    const rec = this.store.get(userId);
    if (!rec) return undefined;
    const age = now.getTime() - rec.capturedAt.getTime();
    if (now.getTime() >= rec.expiresAt.getTime()) {
      const expired: GeoInternalRecord = {
        ...rec,
        freshness: "EXPIRED",
        confidence: 0,
      };
      this.store.upsert(expired);
      return expired;
    }
    const freshness = classifyFreshness(age, this.policy);
    const next: GeoInternalRecord = {
      ...rec,
      freshness,
      confidence: freshnessConfidence(freshness),
    };
    if (next.freshness !== rec.freshness || next.confidence !== rec.confidence) {
      this.store.upsert(next);
    }
    return next;
  }

  private toView(rec: GeoInternalRecord): GeoContextView {
    const view: GeoContextView = {
      spatialCell: rec.spatialCell,
      density: rec.density,
      freshness: rec.freshness,
      movement: rec.movement,
      confidence: rec.confidence,
      expiresAt: rec.expiresAt.toISOString(),
    };
    if (this.adaptiveEnabled) {
      view.recommendedNearM = rec.recommendedNearM;
      view.recommendedAroundM = rec.recommendedAroundM;
    }
    return view;
  }
}

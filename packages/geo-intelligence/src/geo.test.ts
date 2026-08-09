import { describe, expect, it } from "vitest";
import { GeoIntelligenceEngine } from "./engine.js";
import { quantizePoint, spatialCellId } from "./normalize.js";
import { adaptiveRadii } from "./policy.js";
import { MemoryGeoSnapshotStore } from "./store.js";
import { DEFAULT_GEO_POLICY, isGeoIntelligenceEnabled } from "./types.js";

describe("S25 Geo Intelligence package", () => {
  it("flag helper defaults off", () => {
    expect(isGeoIntelligenceEnabled({})).toBe(false);
    expect(isGeoIntelligenceEnabled({ GEO_INTELLIGENCE_ENABLED: "true" })).toBe(true);
  });

  it("same input → same cell; no lat/lng in public view", () => {
    const store = new MemoryGeoSnapshotStore();
    const engine = new GeoIntelligenceEngine(store, DEFAULT_GEO_POLICY, true);
    const now = new Date("2026-08-09T12:00:00.000Z");
    const a = engine.ingest("u", 49.612345, 6.131234, now);
    const b = engine.ingest("u", 49.612345, 6.131234, now);
    expect(a.view.spatialCell).toBe(b.view.spatialCell);
    expect(a.view.spatialCell).toMatch(/^cell_/);
    expect(JSON.stringify(a.view)).not.toMatch(/lat|lng|49\.|6\.13|distanceMeters/);
    expect(a.quantized).toEqual(quantizePoint(49.612345, 6.131234, 3));
  });

  it("expired snapshot ignored (forUser undefined)", () => {
    const store = new MemoryGeoSnapshotStore();
    const engine = new GeoIntelligenceEngine(store, { ...DEFAULT_GEO_POLICY, snapshotTtlMs: 1000 });
    const t0 = new Date("2026-08-09T12:00:00.000Z");
    engine.ingest("u", 48.85, 2.35, t0);
    expect(engine.forUser("u", t0)?.freshness).toBe("FRESH");
    const later = new Date(t0.getTime() + 2000);
    expect(engine.forUser("u", later)).toBeUndefined();
  });

  it("ghost location: large gap does not use stale prev for FAST_MOVING", () => {
    const store = new MemoryGeoSnapshotStore();
    const engine = new GeoIntelligenceEngine(store, {
      ...DEFAULT_GEO_POLICY,
      movementMaxGapMs: 60_000,
      snapshotTtlMs: 300_000,
    });
    const t0 = new Date("2026-08-09T12:00:00.000Z");
    engine.ingest("u", 48.85, 2.35, t0);
    // Jump 1 degree ~111km after 2 minutes (> movementMaxGap)
    const t1 = new Date(t0.getTime() + 120_000);
    const r = engine.ingest("u", 49.85, 2.35, t1);
    expect(r.view.movement).toBe("STATIONARY");
    expect(r.approxDeltaM).toBeUndefined();
  });

  it("adaptive radii: HIGH density tighter than LOW", () => {
    const high = adaptiveRadii("HIGH", "STATIONARY", "FRESH", DEFAULT_GEO_POLICY, true);
    const low = adaptiveRadii("LOW", "STATIONARY", "FRESH", DEFAULT_GEO_POLICY, true);
    expect(high.nearM).toBeLessThan(low.nearM);
    expect(high.aroundM).toBeLessThan(low.aroundM);
    const off = adaptiveRadii("HIGH", "STATIONARY", "FRESH", DEFAULT_GEO_POLICY, false);
    expect(off.nearM).toBe(DEFAULT_GEO_POLICY.nearM);
  });

  it("forPair bands without exposing meters; same cell detection", () => {
    const store = new MemoryGeoSnapshotStore();
    const engine = new GeoIntelligenceEngine(store);
    const now = new Date("2026-08-09T12:00:00.000Z");
    engine.ingest("a", 48.8566, 2.3522, now);
    engine.ingest("b", 48.85665, 2.35225, now);
    const pair = engine.forPair("a", "b", now);
    expect(pair?.distanceBand).toMatch(/NEAR|AROUND|FAR/);
    expect(typeof pair?.sameCell).toBe("boolean");
    expect(JSON.stringify(pair)).not.toMatch(/lat|lng|meters/);
  });

  it("shared store = multi-instance same cell", () => {
    const shared = new MemoryGeoSnapshotStore();
    const a = new GeoIntelligenceEngine(shared);
    const b = new GeoIntelligenceEngine(shared);
    const now = new Date("2026-08-09T12:00:00.000Z");
    a.ingest("u", 48.85, 2.35, now);
    expect(b.forUser("u", now)?.spatialCell).toBe(
      spatialCellId(quantizePoint(48.85, 2.35, 3), DEFAULT_GEO_POLICY.cellStep),
    );
  });

  it("clear removes snapshot", () => {
    const store = new MemoryGeoSnapshotStore();
    const engine = new GeoIntelligenceEngine(store);
    const now = new Date("2026-08-09T12:00:00.000Z");
    engine.ingest("u", 48.85, 2.35, now);
    engine.clear("u");
    expect(engine.forUser("u", now)).toBeUndefined();
  });
});

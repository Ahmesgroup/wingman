import { describe, expect, it } from "vitest";
import { buildMeasurementReport } from "./aggregate.js";
import {
  hashActorKey,
  MeasurementEngine,
  MeasurementLearningForbiddenError,
} from "./engine.js";
import { MemoryMeasurementStore } from "./store.js";
import { captureFlagSnapshot, isMeasurementEnabled } from "./types.js";

describe("S26 Measurement package", () => {
  it("flag helper defaults off", () => {
    expect(isMeasurementEnabled({})).toBe(false);
    expect(isMeasurementEnabled({ MEASUREMENT_ENABLED: "true" })).toBe(true);
  });

  it("refuses construction when learning enabled", () => {
    const prev = process.env.MEASUREMENT_LEARNING_ENABLED;
    process.env.MEASUREMENT_LEARNING_ENABLED = "true";
    try {
      expect(() => new MeasurementEngine(new MemoryMeasurementStore())).toThrow(
        MeasurementLearningForbiddenError,
      );
    } finally {
      if (prev === undefined) delete process.env.MEASUREMENT_LEARNING_ENABLED;
      else process.env.MEASUREMENT_LEARNING_ENABLED = prev;
    }
  });

  it("records decisions/outcomes and aggregates quality + safety", () => {
    delete process.env.MEASUREMENT_LEARNING_ENABLED;
    const store = new MemoryMeasurementStore();
    const eng = new MeasurementEngine(store);
    const t0 = new Date("2026-08-11T10:00:00.000Z");
    const t1 = new Date("2026-08-11T11:00:00.000Z");

    eng.recordDecision({
      engine: "RADAR_RANKING",
      engineVersion: "1.1.1",
      kind: "rank",
      reasons: ["nearby", "same_spatial_cell"],
      at: t0,
      actorKey: hashActorKey("a"),
    });
    eng.recordOutcome({ kind: "radar.ranked", at: t0 });
    eng.recordOutcome({ kind: "signal.created", at: t0 });
    eng.recordOutcome({ kind: "signal.created", at: t0 });
    eng.recordOutcome({ kind: "connection.opened", at: t1 });
    eng.recordOutcome({ kind: "block.issued", at: t1 });
    eng.recordOutcome({ kind: "geo.ingested", at: t0, meta: { density: "HIGH" } });
    eng.recordOutcome({ kind: "geo.ingested", at: t0, meta: { density: "LOW" } });

    const report = eng.report(t0, t1);
    expect(report.learningEnabled).toBe(false);
    expect(report.quality.signalsCreated).toBe(2);
    expect(report.quality.connectionsOpened).toBe(1);
    expect(report.quality.signalToConnectionRate).toBe(0.5);
    expect(report.safety.blocksIssued).toBe(1);
    expect(report.geo.ingests).toBe(2);
    expect(report.geo.highDensityShare).toBe(0.5);
    expect(report.byEngine.RADAR_RANKING?.decisions).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/"lat"|"lng"|phone/);
  });

  it("sanitizeMeta drops lat/lng keys", () => {
    delete process.env.MEASUREMENT_LEARNING_ENABLED;
    const eng = new MeasurementEngine(new MemoryMeasurementStore());
    const d = eng.recordDecision({
      engine: "GEO_INTELLIGENCE",
      engineVersion: "1.1.0",
      kind: "geo_ingest",
      at: new Date("2026-08-11T12:00:00.000Z"),
      meta: { lat: 1, density: "HIGH", lng: 2 },
    });
    expect(d.meta).toEqual({ density: "HIGH" });
  });

  it("captureFlagSnapshot is deterministic for env", () => {
    const snap = captureFlagSnapshot({
      RADAR_INTELLIGENCE_ENABLED: "true",
      MEASUREMENT_ENABLED: "true",
    });
    expect(snap.RADAR_INTELLIGENCE_ENABLED).toBe(true);
    expect(snap.GEO_INTELLIGENCE_ENABLED).toBe(false);
    expect(snap.MEASUREMENT_LEARNING_ENABLED).toBe(false);
  });

  it("buildMeasurementReport empty window", () => {
    const flags = captureFlagSnapshot({});
    const r = buildMeasurementReport([], [], flags, {
      from: new Date("2026-08-11T00:00:00.000Z"),
      to: new Date("2026-08-11T23:59:59.000Z"),
    });
    expect(r.quality.signalToConnectionRate).toBeNull();
    expect(r.window.decisionCount).toBe(0);
  });
});

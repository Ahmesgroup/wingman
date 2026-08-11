import type {
  DecisionRecord,
  FlagSnapshot,
  LatencySummary,
  MeasurementReport,
  OutcomeRecord,
} from "./types.js";
import { MEASUREMENT_POLICY_VERSION, MEASUREMENT_VERSION } from "./types.js";

function countBy<T extends string>(items: { kind?: T; engine?: string }[], key: "kind" | "engine"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key === "kind" ? item.kind : item.engine;
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 1000;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function latencySummary(outcomes: OutcomeRecord[], kind: string, metaKey = "latencyMs"): LatencySummary {
  const samples: number[] = [];
  for (const o of outcomes) {
    if (o.kind !== kind) continue;
    const v = o.meta?.[metaKey];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) samples.push(v);
  }
  samples.sort((a, b) => a - b);
  return {
    samples: samples.length,
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
  };
}

/**
 * Pure aggregation — no learning, no model updates, no feedback into engines.
 * Measurement observes; it never decides.
 */
export function buildMeasurementReport(
  decisions: DecisionRecord[],
  outcomes: OutcomeRecord[],
  flags: FlagSnapshot,
  window: { from: Date; to: Date },
): MeasurementReport {
  const byEngine: Record<string, { decisions: number }> = {};
  for (const d of decisions) {
    byEngine[d.engine] = byEngine[d.engine] ?? { decisions: 0 };
    byEngine[d.engine]!.decisions += 1;
  }

  const outcomeCounts = countBy(outcomes, "kind");
  const signalsCreated = outcomeCounts["signal.created"] ?? 0;
  const connectionsOpened = outcomeCounts["connection.opened"] ?? 0;
  const blocksIssued = outcomeCounts["block.issued"] ?? 0;
  const abuseEnforced = outcomeCounts["abuse.enforced"] ?? 0;
  const destinyProposed = outcomeCounts["destiny.proposed"] ?? 0;
  const destinyMutual = outcomeCounts["destiny.mutual"] ?? 0;
  const destinyAccepts = outcomeCounts["destiny.accept"] ?? 0;
  const geoIngests = outcomeCounts["geo.ingested"] ?? 0;
  const missionEntered = outcomeCounts["mission.entered"] ?? 0;
  const missionCompleted = outcomeCounts["mission.completed"] ?? 0;
  const repeatExposures = outcomeCounts["radar.repeat_exposure"] ?? 0;
  const radarRanked = outcomeCounts["radar.ranked"] ?? 0;
  const contextFallbacks = outcomeCounts["context.fallback"] ?? 0;
  const geoFallbacks = outcomeCounts["geo.fallback"] ?? 0;

  let highDensity = 0;
  for (const o of outcomes) {
    if (o.kind === "geo.ingested" && o.meta?.density === "HIGH") highDensity += 1;
  }

  const destinyEvaluates = decisions.filter((d) => d.kind === "destiny_evaluate").length;
  const fallbackDenom = radarRanked + destinyEvaluates;

  return {
    policyVersion: MEASUREMENT_POLICY_VERSION,
    measurementVersion: MEASUREMENT_VERSION,
    learningEnabled: false,
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      decisionCount: decisions.length,
      outcomeCount: outcomes.length,
    },
    byEngine,
    outcomes: outcomeCounts,
    quality: {
      signalsCreated,
      connectionsOpened,
      signalToConnectionRate: rate(connectionsOpened, signalsCreated),
      destinyProposed,
      destinyMutual,
    },
    safety: {
      blocksIssued,
      abuseEnforced,
      blocksPerSignal: rate(blocksIssued, signalsCreated),
    },
    geo: {
      ingests: geoIngests,
      highDensityShare: rate(highDensity, geoIngests),
    },
    baselines: {
      missionEntered,
      missionCompleted,
      connectionToMissionRate: rate(missionEntered, connectionsOpened),
      missionCompletionRate: rate(missionCompleted, missionEntered),
      timeToSignal: latencySummary(outcomes, "signal.created", "latencyMs"),
      repeatExposures,
      repeatExposureRate: rate(repeatExposures, radarRanked),
      destinyAccepts,
      destinyAcceptanceRate: rate(destinyMutual, destinyProposed),
      contextFallbacks,
      geoFallbacks,
      fallbackShare: rate(contextFallbacks + geoFallbacks, fallbackDenom),
    },
    flagsSeen: flags,
  };
}

/** Strip anything that must never appear in HTTP reports. */
export function assertReportSafe(report: MeasurementReport): void {
  const raw = JSON.stringify(report);
  if (/"lat"|"lng"|distanceMeters|phone|selfie/i.test(raw)) {
    throw new Error("measurement_report_leaked_sensitive");
  }
}

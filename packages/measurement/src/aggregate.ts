import type {
  DecisionRecord,
  FlagSnapshot,
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

/** Pure aggregation — no learning, no model updates. */
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
  const geoIngests = outcomeCounts["geo.ingested"] ?? 0;

  let highDensity = 0;
  for (const o of outcomes) {
    if (o.kind === "geo.ingested" && o.meta?.density === "HIGH") highDensity += 1;
  }

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

import { randomUUID } from "node:crypto";
import { assertReportSafe, buildMeasurementReport } from "./aggregate.js";
import type { MeasurementStore } from "./store.js";
import type {
  DecisionKind,
  DecisionRecord,
  FlagSnapshot,
  MeasuredEngine,
  MeasurementReport,
  OutcomeKind,
  OutcomeRecord,
} from "./types.js";
import {
  captureFlagSnapshot,
  isMeasurementLearningEnabled,
  MEASUREMENT_ENGINE,
  MEASUREMENT_VERSION,
} from "./types.js";

export class MeasurementLearningForbiddenError extends Error {
  readonly code = "MEASUREMENT_LEARNING_FORBIDDEN";
  constructor() {
    super("S26 forbids auto-learning; set MEASUREMENT_LEARNING_ENABLED=false");
    this.name = "MeasurementLearningForbiddenError";
  }
}

export interface RecordDecisionInput {
  engine: MeasuredEngine;
  engineVersion: string;
  kind: DecisionKind;
  reasons?: string[];
  at: Date;
  actorKey?: string;
  meta?: Record<string, string | number | boolean>;
  flags?: FlagSnapshot;
}

export interface RecordOutcomeInput {
  kind: OutcomeKind;
  at: Date;
  decisionId?: string;
  meta?: Record<string, string | number | boolean>;
}

/**
 * Measurement facade — observe decisions & outcomes; aggregate reports.
 * Never mutates Radar / Signal / Destiny / Anti-Abuse / Geo rules.
 * Never trains or updates models (learning forbidden in S26).
 */
export class MeasurementEngine {
  constructor(private readonly store: MeasurementStore) {
    if (isMeasurementLearningEnabled()) {
      throw new MeasurementLearningForbiddenError();
    }
  }

  getStore(): MeasurementStore {
    return this.store;
  }

  recordDecision(input: RecordDecisionInput): DecisionRecord {
    if (isMeasurementLearningEnabled()) throw new MeasurementLearningForbiddenError();
    const record: DecisionRecord = {
      id: `msr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      engine: input.engine,
      engineVersion: input.engineVersion,
      kind: input.kind,
      reasons: input.reasons ?? [],
      flags: input.flags ?? captureFlagSnapshot(),
      at: input.at.toISOString(),
      actorKey: input.actorKey,
      meta: sanitizeMeta(input.meta),
    };
    this.store.appendDecision(record);
    return record;
  }

  recordOutcome(input: RecordOutcomeInput): OutcomeRecord {
    if (isMeasurementLearningEnabled()) throw new MeasurementLearningForbiddenError();
    const record: OutcomeRecord = {
      id: `out_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      kind: input.kind,
      at: input.at.toISOString(),
      decisionId: input.decisionId,
      meta: sanitizeMeta(input.meta),
    };
    this.store.appendOutcome(record);
    return record;
  }

  report(from: Date, to: Date, flags?: FlagSnapshot): MeasurementReport {
    const decisions = this.store.listDecisions(from, to);
    const outcomes = this.store.listOutcomes(from, to);
    const report = buildMeasurementReport(
      decisions,
      outcomes,
      flags ?? captureFlagSnapshot(),
      { from, to },
    );
    assertReportSafe(report);
    return report;
  }

  /** Identity for audit envelopes */
  identity() {
    return { engine: MEASUREMENT_ENGINE, version: MEASUREMENT_VERSION };
  }
}

function sanitizeMeta(
  meta?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = k.toLowerCase();
    if (key.includes("lat") || key.includes("lng") || key.includes("phone") || key.includes("token")) {
      continue;
    }
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Stable opaque actor key — not reversible to userId without pepper (S26 uses plain hash). */
export function hashActorKey(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `u_${(h >>> 0).toString(16)}`;
}

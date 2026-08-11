/** Observe & audit V1.1 engines — never auto-learn in S26. Measurement observes; it never decides. */
export function isMeasurementEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEASUREMENT_ENABLED === "true";
}

/**
 * Learning switch — S26 MUST keep this false.
 * When true, MeasurementEngine refuses to start (gate: no auto-learning before measurement).
 */
export function isMeasurementLearningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEASUREMENT_LEARNING_ENABLED === "true";
}

export const MEASUREMENT_ENGINE = "MEASUREMENT";
export const MEASUREMENT_VERSION = "1.2.0";
export const MEASUREMENT_POLICY_VERSION = "1.1";

export type MeasuredEngine =
  | "RADAR_RANKING"
  | "CONTEXT_ENGINE"
  | "DESTINY_V2"
  | "ANTI_ABUSE"
  | "GEO_INTELLIGENCE"
  | "CORE_SIGNAL"
  | "CORE_SAFETY"
  | "CORE_CONNECTION";

export type DecisionKind =
  | "rank"
  | "context_snapshot"
  | "destiny_evaluate"
  | "destiny_mutual"
  | "destiny_accept"
  | "abuse_decision"
  | "geo_ingest"
  | "signal_create"
  | "connection_open"
  | "block_issued"
  | "mission_enter"
  | "mission_complete";

/** Flag snapshot for reversibility / attribution — booleans only */
export interface FlagSnapshot {
  RADAR_INTELLIGENCE_ENABLED: boolean;
  CONTEXT_ENGINE_ENABLED: boolean;
  DESTINY_V2_ENABLED: boolean;
  DESTINY_V2_PROPOSALS_ENABLED: boolean;
  ANTI_ABUSE_ENABLED: boolean;
  ANTI_ABUSE_ENFORCEMENT_ENABLED: boolean;
  GEO_INTELLIGENCE_ENABLED: boolean;
  GEO_ADAPTIVE_RADIUS_ENABLED: boolean;
  MEASUREMENT_ENABLED: boolean;
  MEASUREMENT_LEARNING_ENABLED: boolean;
}

export function captureFlagSnapshot(env: NodeJS.ProcessEnv = process.env): FlagSnapshot {
  return {
    RADAR_INTELLIGENCE_ENABLED: env.RADAR_INTELLIGENCE_ENABLED === "true",
    CONTEXT_ENGINE_ENABLED: env.CONTEXT_ENGINE_ENABLED === "true",
    DESTINY_V2_ENABLED: env.DESTINY_V2_ENABLED === "true",
    DESTINY_V2_PROPOSALS_ENABLED: env.DESTINY_V2_PROPOSALS_ENABLED === "true",
    ANTI_ABUSE_ENABLED: env.ANTI_ABUSE_ENABLED === "true",
    ANTI_ABUSE_ENFORCEMENT_ENABLED: env.ANTI_ABUSE_ENFORCEMENT_ENABLED === "true",
    GEO_INTELLIGENCE_ENABLED: env.GEO_INTELLIGENCE_ENABLED === "true",
    GEO_ADAPTIVE_RADIUS_ENABLED: env.GEO_ADAPTIVE_RADIUS_ENABLED === "true",
    MEASUREMENT_ENABLED: env.MEASUREMENT_ENABLED === "true",
    MEASUREMENT_LEARNING_ENABLED: env.MEASUREMENT_LEARNING_ENABLED === "true",
  };
}

/**
 * Decision audit record — named reasons, versions, flags.
 * Never lat/lng, phones, message bodies, or opaque lone scores as the sole justification.
 */
export interface DecisionRecord {
  id: string;
  engine: MeasuredEngine;
  engineVersion: string;
  kind: DecisionKind;
  /** Named, auditable reasons (may be empty for pure counters) */
  reasons: string[];
  flags: FlagSnapshot;
  at: string;
  /** Optional hashed actor — never raw user id in exported reports */
  actorKey?: string;
  meta?: Record<string, string | number | boolean>;
}

export type OutcomeKind =
  | "signal.created"
  | "connection.opened"
  | "block.issued"
  | "abuse.enforced"
  | "destiny.proposed"
  | "destiny.accept"
  | "destiny.mutual"
  | "radar.ranked"
  | "radar.repeat_exposure"
  | "geo.ingested"
  | "mission.entered"
  | "mission.completed"
  | "context.fallback"
  | "geo.fallback";

export interface OutcomeRecord {
  id: string;
  kind: OutcomeKind;
  at: string;
  /** Link to a prior decision when known */
  decisionId?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface LatencySummary {
  samples: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

/**
 * S26 baseline funnel — observe-only proxies for comparing S21–S25.
 * Never fed back into ranking / Destiny / geo engines.
 */
export interface BaselineMetrics {
  missionEntered: number;
  missionCompleted: number;
  connectionToMissionRate: number | null;
  missionCompletionRate: number | null;
  timeToSignal: LatencySummary;
  repeatExposures: number;
  /** Share of radar.ranked sessions that included ≥1 repeat candidate */
  repeatExposureRate: number | null;
  destinyAccepts: number;
  /** destiny.mutual / destiny.proposed */
  destinyAcceptanceRate: number | null;
  contextFallbacks: number;
  geoFallbacks: number;
  /** (context+geo fallbacks) / (radar.ranked + destiny evaluates) */
  fallbackShare: number | null;
}

export interface MeasurementReport {
  policyVersion: string;
  measurementVersion: string;
  learningEnabled: false;
  window: { from: string; to: string; decisionCount: number; outcomeCount: number };
  byEngine: Record<string, { decisions: number }>;
  outcomes: Record<string, number>;
  quality: {
    signalsCreated: number;
    connectionsOpened: number;
    signalToConnectionRate: number | null;
    destinyProposed: number;
    destinyMutual: number;
  };
  safety: {
    blocksIssued: number;
    abuseEnforced: number;
    blocksPerSignal: number | null;
  };
  geo: {
    ingests: number;
    /** Share of geo ingests marked HIGH density — no cell ids */
    highDensityShare: number | null;
  };
  baselines: BaselineMetrics;
  flagsSeen: FlagSnapshot;
}

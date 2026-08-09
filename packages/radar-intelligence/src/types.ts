/** Feature flag — when false, Nest must return V1 order unchanged. */
export function isRadarIntelligenceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RADAR_INTELLIGENCE_ENABLED === "true";
}

export const RADAR_RANKING_VERSION = "1.1.1";
export const RADAR_RANKING_ENGINE = "RADAR_RANKING";

/**
 * Port for contextual enrichment — Nest adapts Context Engine snapshots here.
 * @wingman/radar-intelligence MUST NOT import Context Engine implementation.
 */
export interface RadarContextPort {
  /**
   * Normalized context view for ranking. Missing fields = neutral (no penalty).
   * Expired / disabled engines return undefined.
   */
  forUser(
    userId: string,
    now: Date,
  ):
    | {
        languages?: string[];
        availabilityMinutes?: number;
        mobility?: string;
        intention?: string;
        mood?: string;
        /** 0..1 freshness when known */
        freshness?: number;
      }
    | undefined;
}

/** V1-eligible candidate view + optional server-only enrichment. Never from client trust. */
export interface EligibleCandidate {
  userId: string;
  approximateDistanceBand: "NEAR" | "AROUND";
  mood?: string;
  intention?: string;
  /** ms remaining on presence TTL — freshness signal (legacy S21 path) */
  presenceRemainingMs?: number;
  /** last heartbeat age in ms (legacy S21 path) */
  heartbeatAgeMs?: number;
  /** optional language tags — prefer RadarContextPort when CONTEXT_ENGINE enabled */
  languages?: string[];
  /** recent signal/interaction with viewer (server-derived) */
  recentInteraction?: boolean;
  /** Context Engine freshness 0..1 when available */
  contextFreshness?: number;
  /** S25 Geo — same opaque spatial cell as viewer (ranking only) */
  geoSameCell?: boolean;
}

export type RankingReason =
  | "nearby"
  | "around"
  | "recently_available"
  | "shared_language"
  | "context_compatible"
  | "recent_unsuccessful_exposure"
  | "recent_interaction"
  | "diversity_rotation"
  | "same_spatial_cell";

export interface RankedDecision {
  candidateId: string;
  /** Internal only — never expose to clients */
  score: number;
  reasons: RankingReason[];
}

export interface RankingAuditRecord {
  engine: typeof RADAR_RANKING_ENGINE;
  version: typeof RADAR_RANKING_VERSION;
  decisionId: string;
  viewerId: string;
  timestamp: string;
  inputCount: number;
  outputOrder: string[];
  decisions: RankedDecision[];
}

export interface RankRadarInput {
  viewerId: string;
  viewerLanguages?: string[];
  now: Date;
  candidates: EligibleCandidate[];
  /** Recent impression counts viewer→candidate (higher = recently over-exposed) */
  recentExposureCount?: (candidateId: string) => number;
  /** Optional Context Engine port — when provided, preferred over inline languages */
  contextPort?: RadarContextPort;
}

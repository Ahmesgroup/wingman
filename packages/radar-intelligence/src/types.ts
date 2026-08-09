/** Feature flag — when false, Nest must return V1 order unchanged. */
export function isRadarIntelligenceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RADAR_INTELLIGENCE_ENABLED === "true";
}

export const RADAR_RANKING_VERSION = "1.1.0";
export const RADAR_RANKING_ENGINE = "RADAR_RANKING";

/** V1-eligible candidate view + optional server-only enrichment. Never from client trust. */
export interface EligibleCandidate {
  userId: string;
  approximateDistanceBand: "NEAR" | "AROUND";
  mood?: string;
  intention?: string;
  /** ms remaining on presence TTL — freshness signal */
  presenceRemainingMs?: number;
  /** last heartbeat age in ms */
  heartbeatAgeMs?: number;
  /** optional language tags from Context hints (S22 will own this); not identity */
  languages?: string[];
  /** recent signal/interaction with viewer (server-derived) */
  recentInteraction?: boolean;
}

export type RankingReason =
  | "nearby"
  | "around"
  | "recently_available"
  | "shared_language"
  | "context_compatible"
  | "recent_unsuccessful_exposure"
  | "recent_interaction"
  | "diversity_rotation";

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
}

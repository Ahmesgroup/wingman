/** Master switch — false = Destiny V1 behavior bit-for-bit at Nest boundary. */
export function isDestinyV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DESTINY_V2_ENABLED === "true";
}

/**
 * When V2 enabled but proposals false → shadow mode:
 * compute candidates/metrics, no user-visible proposals.
 */
export function isDestinyV2ProposalsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DESTINY_V2_PROPOSALS_ENABLED === "true";
}

export const DESTINY_V2_ENGINE = "DESTINY_V2";
export const DESTINY_V2_VERSION = "1.1.0";

export type DestinyProposalStatus =
  | "PROPOSED"
  | "A_ACCEPTED"
  | "B_ACCEPTED"
  | "MUTUAL"
  | "EXPIRED"
  | "DECLINED"
  | "INVALIDATED";

export type DestinyCandidateDecision = "CANDIDATE" | "REJECTED_RARITY" | "REJECTED_POLICY" | "INELIGIBLE";

export type DestinyReason =
  | "strong_context_overlap"
  | "both_recently_available"
  | "language_compatible"
  | "distance_near"
  | "low_recent_exposure"
  | "no_recent_interaction"
  | "user_cooldown"
  | "pair_cooldown"
  | "rejection_cooldown"
  | "active_proposal_exists"
  | "below_threshold"
  | "rarity_gate"
  | "missing_context_neutral";

/** Context view — mirrors RadarContextPort shape; no coordinates. */
export interface DestinyContextView {
  languages?: string[];
  availabilityMinutes?: number;
  mobility?: string;
  intention?: string;
  mood?: string;
  freshness?: number;
}

export interface DestinyContextPort {
  forUser(userId: string, now: Date): DestinyContextView | undefined;
}

export interface DestinyPairInput {
  userA: string;
  userB: string;
  /** Caller must certify V1 eligibility — engine refuses if false */
  v1Eligible: boolean;
  distanceBand?: "NEAR" | "AROUND";
  recentInteraction?: boolean;
  recentExposureCount?: number;
  now: Date;
  contextPort?: DestinyContextPort;
}

export interface DestinyCandidateResult {
  pair: [string, string];
  pairKey: string;
  decision: DestinyCandidateDecision;
  /** Internal only */
  score: number;
  reasons: DestinyReason[];
  expiresAt?: string;
}

export interface DestinyPolicyConfig {
  minScore: number;
  /** 0–100; 100 = always allow when score ok (tests) */
  rarityPercent: number;
  proposalTtlMs: number;
  userCooldownMs: number;
  pairCooldownMs: number;
  rejectionCooldownMs: number;
  maxSimultaneousProposalsPerUser: number;
}

export const DEFAULT_DESTINY_POLICY: DestinyPolicyConfig = {
  minScore: 0.72,
  rarityPercent: 100,
  proposalTtlMs: 15 * 60 * 1000,
  userCooldownMs: 24 * 60 * 60 * 1000,
  pairCooldownMs: 7 * 24 * 60 * 60 * 1000,
  rejectionCooldownMs: 48 * 60 * 60 * 1000,
  maxSimultaneousProposalsPerUser: 1,
};

export interface DestinyProposal {
  id: string;
  pairKey: string;
  userA: string;
  userB: string;
  status: DestinyProposalStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedBy: Set<string>;
  /** Internal audit */
  score: number;
  reasons: DestinyReason[];
  connectionId?: string;
  signalId?: string;
}

/** Public DTO — abstract message only */
export interface DestinyProposalPublic {
  proposalId: string;
  status: DestinyProposalStatus;
  message: string;
  expiresAt: string;
}

export const DESTINY_PUBLIC_MESSAGE = "Une convergence inhabituelle vient d'être détectée.";

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function toPublicProposal(p: DestinyProposal): DestinyProposalPublic {
  return {
    proposalId: p.id,
    status: p.status,
    message: DESTINY_PUBLIC_MESSAGE,
    expiresAt: p.expiresAt.toISOString(),
  };
}

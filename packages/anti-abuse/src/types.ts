/** Master switch — false = zero observation, zero enforcement (S23 exact). */
export function isAntiAbuseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ANTI_ABUSE_ENABLED === "true";
}

/**
 * When enabled but enforcement false → shadow mode:
 * observe + evaluate risk/action, never block or write sanctions.
 */
export function isAntiAbuseEnforcementEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ANTI_ABUSE_ENFORCEMENT_ENABLED === "true";
}

export const ANTI_ABUSE_ENGINE = "ANTI_ABUSE";
export const ANTI_ABUSE_VERSION = "1.1.0";
export const ANTI_ABUSE_POLICY_VERSION = "1.0";

export type AbuseEventKind =
  | "signal.sent"
  | "signal.refused_by_target"
  | "radar.candidates"
  | "destiny.copresence"
  | "destiny.accept"
  | "destiny.decline"
  | "safety.block_issued"
  | "safety.block_received"
  | "auth.otp_request"
  | "geo.heartbeat";

/** Named, auditable risk signals — never a lone opaque score. */
export type RiskSignalName =
  | "signal_burst"
  | "high_target_diversity"
  | "reject_resend_pattern"
  | "recent_block_received"
  | "radar_scraping"
  | "impossible_geo_jump"
  | "destiny_repetitive"
  | "otp_burst";

export type RiskLevel = "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";

/** Graduated actions — BLOCK/BAN reserved for human / other security layers. */
export type AbuseAction =
  | "ALLOW"
  | "SLOW_DOWN"
  | "COOLDOWN"
  | "CHALLENGE"
  | "TEMP_RESTRICT"
  | "REVIEW";

export type EnforcementScope =
  | "SIGNAL_CREATE"
  | "DESTINY_ACTION"
  | "RADAR_CANDIDATES"
  | "OTP_REQUEST"
  | "ALL";

export interface AbuseEvent {
  id: string;
  kind: AbuseEventKind;
  actorId: string;
  /** Optional peer / target — never lat/lng or message bodies */
  subjectId?: string;
  at: Date;
  /** Opaque metadata only (counts, bands) — no exact coords */
  meta?: Record<string, string | number | boolean>;
}

export interface ActiveSanction {
  userId: string;
  action: AbuseAction;
  scopes: EnforcementScope[];
  reasons: RiskSignalName[];
  riskLevel: RiskLevel;
  policyVersion: string;
  createdAt: Date;
  expiresAt: Date;
  /** Dedup key so replay does not stack penalties */
  sourceEventId: string;
}

export interface RiskDecision {
  signals: RiskSignalName[];
  riskLevel: RiskLevel;
  policyVersion: string;
  action: AbuseAction;
  scopes: EnforcementScope[];
  /** Internal audit only */
  reasons: string[];
  durationMs: number;
  shadow: boolean;
  decisionId: string;
  at: string;
  engine: typeof ANTI_ABUSE_ENGINE;
  version: typeof ANTI_ABUSE_VERSION;
}

export interface PolicyThresholds {
  signalBurstCount: number;
  signalBurstWindowMs: number;
  targetDiversityCount: number;
  targetDiversityWindowMs: number;
  rejectResendWindowMs: number;
  blockReceivedWindowMs: number;
  radarScrapeCount: number;
  radarScrapeWindowMs: number;
  destinyRepetitiveCount: number;
  destinyRepetitiveWindowMs: number;
  otpBurstCount: number;
  otpBurstWindowMs: number;
  /** meters/second equivalent using coarse buckets only */
  impossibleGeoJumpMeters: number;
  impossibleGeoJumpMaxMs: number;
  cooldownMs: number;
  slowDownMs: number;
  tempRestrictMs: number;
  challengeMs: number;
}

export const DEFAULT_POLICY_THRESHOLDS: PolicyThresholds = {
  signalBurstCount: 5,
  signalBurstWindowMs: 60_000,
  targetDiversityCount: 4,
  targetDiversityWindowMs: 5 * 60_000,
  rejectResendWindowMs: 10 * 60_000,
  blockReceivedWindowMs: 24 * 60 * 60_000,
  radarScrapeCount: 30,
  radarScrapeWindowMs: 60_000,
  destinyRepetitiveCount: 8,
  destinyRepetitiveWindowMs: 60 * 60_000,
  otpBurstCount: 8,
  otpBurstWindowMs: 10 * 60_000,
  impossibleGeoJumpMeters: 50_000,
  impossibleGeoJumpMaxMs: 5 * 60_000,
  cooldownMs: 15 * 60_000,
  slowDownMs: 30_000,
  tempRestrictMs: 2 * 60 * 60_000,
  challengeMs: 60 * 60_000,
};

export const ACTION_RANK: Record<AbuseAction, number> = {
  ALLOW: 0,
  SLOW_DOWN: 1,
  REVIEW: 2,
  COOLDOWN: 3,
  CHALLENGE: 4,
  TEMP_RESTRICT: 5,
};

import type { DestinyCandidateResult, DestinyPolicyConfig, DestinyReason } from "./types.js";
import { DEFAULT_DESTINY_POLICY } from "./types.js";

/** Deterministic rarity gate — same pair+day → same allow/deny. */
export function rarityAllows(pairKey: string, dayKey: string, percent: number): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  let h = 0;
  const s = `${pairKey}|${dayKey}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100 < percent;
}

export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface PolicyGates {
  userOnCooldown: boolean;
  pairOnCooldown: boolean;
  rejectionOnCooldown: boolean;
  hasActiveProposal: boolean;
}

/**
 * Destiny Policy — rarity + cooldowns. May reject a strong candidate.
 * Does not create connections.
 */
export function applyDestinyPolicy(
  candidate: DestinyCandidateResult,
  gates: PolicyGates,
  now: Date,
  config: DestinyPolicyConfig = DEFAULT_DESTINY_POLICY,
): DestinyCandidateResult {
  if (candidate.decision === "INELIGIBLE") return candidate;

  const reasons: DestinyReason[] = [...candidate.reasons];

  if (gates.userOnCooldown) {
    reasons.push("user_cooldown");
    return { ...candidate, decision: "REJECTED_POLICY", reasons, score: candidate.score };
  }
  if (gates.pairOnCooldown) {
    reasons.push("pair_cooldown");
    return { ...candidate, decision: "REJECTED_POLICY", reasons, score: candidate.score };
  }
  if (gates.rejectionOnCooldown) {
    reasons.push("rejection_cooldown");
    return { ...candidate, decision: "REJECTED_POLICY", reasons, score: candidate.score };
  }
  if (gates.hasActiveProposal) {
    reasons.push("active_proposal_exists");
    return { ...candidate, decision: "REJECTED_POLICY", reasons, score: candidate.score };
  }

  if (candidate.score < config.minScore) {
    reasons.push("below_threshold");
    return { ...candidate, decision: "REJECTED_POLICY", reasons };
  }

  if (!rarityAllows(candidate.pairKey, utcDayKey(now), config.rarityPercent)) {
    reasons.push("rarity_gate");
    return { ...candidate, decision: "REJECTED_RARITY", reasons };
  }

  const expiresAt = new Date(now.getTime() + config.proposalTtlMs).toISOString();
  return { ...candidate, decision: "CANDIDATE", reasons, expiresAt };
}

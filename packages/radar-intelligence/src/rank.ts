import { randomUUID } from "node:crypto";
import type {
  EligibleCandidate,
  RankedDecision,
  RankingAuditRecord,
  RankingReason,
  RankRadarInput,
} from "./types.js";
import { RADAR_RANKING_ENGINE, RADAR_RANKING_VERSION } from "./types.js";

/**
 * Contextual ephemeral ranking policy.
 * MUST NOT filter: output set === input set (same userIds).
 * MUST NOT use beauty, popularity, match counts, wealth, addiction scores.
 * Unknown context is neutral — never treated as incompatibility.
 */
export function scoreCandidate(
  c: EligibleCandidate,
  input: RankRadarInput,
): RankedDecision {
  let score = 0.5;
  const reasons: RankingReason[] = [];

  if (c.approximateDistanceBand === "NEAR") {
    score += 0.22;
    reasons.push("nearby");
  } else {
    score += 0.08;
    reasons.push("around");
  }

  const ctx = input.contextPort?.forUser(c.userId, input.now);
  const freshness = ctx?.freshness ?? c.contextFreshness;
  const remaining = c.presenceRemainingMs;

  if (freshness !== undefined) {
    if (freshness >= 0.5) {
      score += 0.12;
      reasons.push("recently_available");
    } else if (freshness >= 0.2) {
      score += 0.05;
      reasons.push("recently_available");
    }
  } else if (remaining !== undefined) {
    if (remaining >= 60_000) {
      score += 0.12;
      reasons.push("recently_available");
    } else if (remaining >= 20_000) {
      score += 0.05;
      reasons.push("recently_available");
    }
  } else if (c.heartbeatAgeMs !== undefined && c.heartbeatAgeMs <= 30_000) {
    score += 0.1;
    reasons.push("recently_available");
  }

  const viewerCtx = input.contextPort?.forUser(input.viewerId, input.now);
  const viewerLangs = (viewerCtx?.languages ?? input.viewerLanguages ?? []).map((l) =>
    l.toLowerCase(),
  );
  const candLangs = (ctx?.languages ?? c.languages ?? []).map((l) => l.toLowerCase());
  // Missing languages on either side → skip signal (neutral), never penalize
  if (viewerLangs.length && candLangs.length && candLangs.some((l) => viewerLangs.includes(l))) {
    score += 0.1;
    reasons.push("shared_language");
  }

  const mood = ctx?.mood ?? c.mood;
  const intention = ctx?.intention ?? c.intention;
  if (mood || intention) {
    score += 0.04;
    reasons.push("context_compatible");
  }

  if (c.recentInteraction) {
    score -= 0.08;
    reasons.push("recent_interaction");
  }

  if (c.geoSameCell) {
    score += 0.06;
    reasons.push("same_spatial_cell");
  }

  const exposures = input.recentExposureCount?.(c.userId) ?? 0;
  if (exposures >= 2) {
    score -= 0.15 * Math.min(exposures, 5);
    reasons.push("recent_unsuccessful_exposure");
    reasons.push("diversity_rotation");
  } else if (exposures === 1) {
    score -= 0.05;
    reasons.push("diversity_rotation");
  }

  score = Math.max(0, Math.min(1, score));
  return { candidateId: c.userId, score: Math.round(score * 1000) / 1000, reasons };
}

export interface RankRadarResult {
  ordered: EligibleCandidate[];
  audit: RankingAuditRecord;
}

export function rankRadarCandidates(input: RankRadarInput): RankRadarResult {
  const scored = input.candidates.map((c) => ({
    candidate: c,
    decision: scoreCandidate(c, input),
  }));

  scored.sort((a, b) => {
    if (b.decision.score !== a.decision.score) return b.decision.score - a.decision.score;
    return a.candidate.userId.localeCompare(b.candidate.userId);
  });

  const ordered = scored.map((s) => s.candidate);
  const decisions = scored.map((s) => s.decision);

  const inIds = [...input.candidates.map((c) => c.userId)].sort();
  const outIds = [...ordered.map((c) => c.userId)].sort();
  if (inIds.length !== outIds.length || inIds.some((id, i) => id !== outIds[i])) {
    throw new Error("RADAR_RANKING_INVARIANT: output candidates must equal input set");
  }

  return {
    ordered,
    audit: {
      engine: RADAR_RANKING_ENGINE,
      version: RADAR_RANKING_VERSION,
      decisionId: randomUUID(),
      viewerId: input.viewerId,
      timestamp: input.now.toISOString(),
      inputCount: input.candidates.length,
      outputOrder: ordered.map((c) => c.userId),
      decisions,
    },
  };
}

export function toPublicCandidateView(c: EligibleCandidate): {
  userId: string;
  approximateDistanceBand: "NEAR" | "AROUND";
  mood?: string;
  intention?: string;
} {
  return {
    userId: c.userId,
    approximateDistanceBand: c.approximateDistanceBand,
    ...(c.mood !== undefined ? { mood: c.mood } : {}),
    ...(c.intention !== undefined ? { intention: c.intention } : {}),
  };
}

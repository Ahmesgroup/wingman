import type {
  DestinyCandidateResult,
  DestinyContextView,
  DestinyPairInput,
  DestinyReason,
} from "./types.js";
import { pairKey } from "./types.js";

function sharedLanguages(a?: DestinyContextView, b?: DestinyContextView): boolean {
  const la = a?.languages ?? [];
  const lb = b?.languages ?? [];
  if (!la.length || !lb.length) return false; // unknown = neutral, not a bonus
  const setB = new Set(lb.map((x) => x.toLowerCase()));
  return la.some((x) => setB.has(x.toLowerCase()));
}

/**
 * Candidate Engine — scores rare contextual convergence.
 * Never invents eligibility: v1Eligible=false → INELIGIBLE.
 * Missing context is neutral (no hard penalty).
 */
export function evaluateDestinyCandidate(input: DestinyPairInput): DestinyCandidateResult {
  const key = pairKey(input.userA, input.userB);
  const pair: [string, string] = input.userA < input.userB ? [input.userA, input.userB] : [input.userB, input.userA];
  const reasons: DestinyReason[] = [];

  if (!input.v1Eligible) {
    return { pair, pairKey: key, decision: "INELIGIBLE", score: 0, reasons: [] };
  }

  let score = 0.45;
  const ctxA = input.contextPort?.forUser(input.userA, input.now);
  const ctxB = input.contextPort?.forUser(input.userB, input.now);

  if (!ctxA && !ctxB) {
    reasons.push("missing_context_neutral");
  }

  if (sharedLanguages(ctxA, ctxB)) {
    score += 0.12;
    reasons.push("language_compatible");
  }

  const freshA = ctxA?.freshness;
  const freshB = ctxB?.freshness;
  const availA = ctxA?.availabilityMinutes;
  const availB = ctxB?.availabilityMinutes;
  if (
    (freshA !== undefined && freshA >= 0.4 && freshB !== undefined && freshB >= 0.4) ||
    (availA !== undefined && availA >= 10 && availB !== undefined && availB >= 10)
  ) {
    score += 0.14;
    reasons.push("both_recently_available");
  }

  const intentionOverlap =
    ctxA?.intention && ctxB?.intention && ctxA.intention === ctxB.intention
      ? true
      : ctxA?.mood && ctxB?.mood && ctxA.mood === ctxB.mood;
  if (intentionOverlap) {
    score += 0.1;
    reasons.push("strong_context_overlap");
  } else if (ctxA?.mobility && ctxB?.mobility && ctxA.mobility === ctxB.mobility) {
    score += 0.06;
    reasons.push("strong_context_overlap");
  }

  if (input.distanceBand === "NEAR") {
    score += 0.1;
    reasons.push("distance_near");
  }

  if (!input.recentInteraction) {
    score += 0.06;
    reasons.push("no_recent_interaction");
  } else {
    score -= 0.12;
  }

  const exposure = input.recentExposureCount ?? 0;
  if (exposure === 0) {
    score += 0.08;
    reasons.push("low_recent_exposure");
  } else if (exposure >= 2) {
    score -= 0.15;
  }

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  return {
    pair,
    pairKey: key,
    decision: "CANDIDATE",
    score,
    reasons,
  };
}

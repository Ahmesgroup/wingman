import type { DensityClass, FreshnessClass, GeoPolicyConfig, MovementClass } from "./types.js";

export function classifyFreshness(ageMs: number, cfg: GeoPolicyConfig): FreshnessClass {
  if (ageMs < 0) return "EXPIRED";
  if (ageMs <= cfg.freshMs) return "FRESH";
  if (ageMs <= cfg.staleMs) return "STALE";
  return "EXPIRED";
}

export function classifyMovement(speedMps: number | undefined, cfg: GeoPolicyConfig): MovementClass {
  if (speedMps === undefined || !Number.isFinite(speedMps)) return "STATIONARY";
  if (speedMps >= cfg.fastMinMps) return "FAST_MOVING";
  if (speedMps >= cfg.walkingMinMps) return "WALKING";
  return "STATIONARY";
}

export function classifyDensity(countInCell: number, cfg: GeoPolicyConfig): DensityClass {
  if (countInCell >= cfg.densityHigh) return "HIGH";
  if (countInCell >= cfg.densityMedium) return "MEDIUM";
  return "LOW";
}

export function freshnessConfidence(freshness: FreshnessClass): number {
  switch (freshness) {
    case "FRESH":
      return 0.95;
    case "STALE":
      return 0.55;
    default:
      return 0;
  }
}

/**
 * Adaptive radius recommendations — denser → tighter; sparse → wider.
 * Never used for V1 eligibility in S25.
 */
export function adaptiveRadii(
  density: DensityClass,
  movement: MovementClass,
  freshness: FreshnessClass,
  cfg: GeoPolicyConfig,
  adaptiveEnabled: boolean,
): { nearM: number; aroundM: number } {
  if (!adaptiveEnabled) {
    return { nearM: cfg.nearM, aroundM: cfg.aroundM };
  }
  let nearM = cfg.nearM;
  let aroundM = cfg.aroundM;
  if (density === "HIGH") {
    nearM = cfg.adaptiveNearHighM;
    aroundM = cfg.adaptiveAroundHighM;
  } else if (density === "LOW") {
    nearM = cfg.adaptiveNearLowM;
    aroundM = cfg.adaptiveAroundLowM;
  }
  if (movement === "FAST_MOVING") {
    aroundM = Math.round(aroundM * 0.7);
  }
  if (freshness === "STALE") {
    nearM = Math.round(nearM * 0.85);
    aroundM = Math.round(aroundM * 0.85);
  }
  return { nearM, aroundM };
}

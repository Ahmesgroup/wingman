/** Master switch — false = geographic V1 behavior (no Geo snapshots / ports). */
export function isGeoIntelligenceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GEO_INTELLIGENCE_ENABLED === "true";
}

/**
 * When Geo on but adaptive false → normalize + freshness only;
 * adaptive radii recommendations stay at V1 defaults.
 */
export function isGeoAdaptiveRadiusEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GEO_ADAPTIVE_RADIUS_ENABLED === "true";
}

export const GEO_ENGINE = "GEO_INTELLIGENCE";
export const GEO_VERSION = "1.1.0";

export type DistanceBand = "NEAR" | "AROUND" | "FAR";
export type DensityClass = "LOW" | "MEDIUM" | "HIGH";
export type FreshnessClass = "FRESH" | "STALE" | "EXPIRED";
/** Session-only mobility — never a durable user trait */
export type MovementClass = "STATIONARY" | "WALKING" | "FAST_MOVING";

/** Public consumer view — never lat/lng / exact meters */
export interface GeoContextView {
  spatialCell: string;
  density: DensityClass;
  freshness: FreshnessClass;
  movement: MovementClass;
  confidence: number;
  /** Recommendations only — must not drive V1 eligibility in S25 */
  recommendedNearM?: number;
  recommendedAroundM?: number;
  expiresAt: string;
}

export interface GeoPairView {
  distanceBand: DistanceBand;
  sameCell: boolean;
}

export interface GeoContextPort {
  forUser(userId: string, now: Date): GeoContextView | undefined;
  forPair(viewerId: string, otherId: string, now: Date): GeoPairView | undefined;
}

export interface GeoPolicyConfig {
  /** Quantize decimals for internal storage (~110m at 3) */
  quantizeDecimals: number;
  /** Grid step in degrees for cell identity */
  cellStep: number;
  snapshotTtlMs: number;
  freshMs: number;
  staleMs: number;
  /** Max gap to use previous point for movement; larger → ignore (no ghost) */
  movementMaxGapMs: number;
  walkingMinMps: number;
  fastMinMps: number;
  densityMedium: number;
  densityHigh: number;
  nearM: number;
  aroundM: number;
  adaptiveNearHighM: number;
  adaptiveAroundHighM: number;
  adaptiveNearLowM: number;
  adaptiveAroundLowM: number;
}

export const DEFAULT_GEO_POLICY: GeoPolicyConfig = {
  quantizeDecimals: 3,
  cellStep: 0.002,
  snapshotTtlMs: 120_000,
  freshMs: 45_000,
  staleMs: 90_000,
  movementMaxGapMs: 90_000,
  walkingMinMps: 0.5,
  fastMinMps: 8,
  densityMedium: 3,
  densityHigh: 8,
  nearM: 50,
  aroundM: 200,
  adaptiveNearHighM: 35,
  adaptiveAroundHighM: 120,
  adaptiveNearLowM: 80,
  adaptiveAroundLowM: 350,
};

/** Internal only — never leave the geo package via GeoContextPort */
export interface GeoInternalPoint {
  lat: number;
  lng: number;
}

export interface GeoInternalRecord {
  userId: string;
  point: GeoInternalPoint;
  spatialCell: string;
  density: DensityClass;
  freshness: FreshnessClass;
  movement: MovementClass;
  confidence: number;
  capturedAt: Date;
  expiresAt: Date;
  recommendedNearM: number;
  recommendedAroundM: number;
}

import type { GeoInternalPoint, GeoPolicyConfig } from "./types.js";
import { DEFAULT_GEO_POLICY } from "./types.js";

/** Privacy reduce — ~11m at 4 decimals, ~110m at 3. */
export function quantizePoint(
  lat: number,
  lng: number,
  decimals: number = DEFAULT_GEO_POLICY.quantizeDecimals,
): GeoInternalPoint {
  const f = 10 ** decimals;
  return {
    lat: Math.round(lat * f) / f,
    lng: Math.round(lng * f) / f,
  };
}

/** Opaque cell id — deterministic for same quantized grid. */
export function spatialCellId(point: GeoInternalPoint, cellStep: number): string {
  const gx = Math.floor(point.lng / cellStep);
  const gy = Math.floor(point.lat / cellStep);
  let h = 2166136261;
  const s = `${gx}:${gy}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cell_${(h >>> 0).toString(16)}`;
}

/** Haversine meters — adapter-internal only; never log or persist result in audits. */
export function distanceMetersInternal(a: GeoInternalPoint, b: GeoInternalPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Coarse planar approx for anti-abuse delta (meters) — no exact coords. */
export function approxDeltaMeters(a: GeoInternalPoint, b: GeoInternalPoint): number {
  const dlat = b.lat - a.lat;
  const dlng = b.lng - a.lng;
  return Math.round(Math.sqrt(dlat * dlat + dlng * dlng) * 111_000);
}

export function bandFromMeters(
  meters: number,
  nearM: number,
  aroundM: number,
): "NEAR" | "AROUND" | "FAR" {
  if (meters <= nearM) return "NEAR";
  if (meters <= aroundM) return "AROUND";
  return "FAR";
}

export function withPolicy(partial?: Partial<GeoPolicyConfig>): GeoPolicyConfig {
  return { ...DEFAULT_GEO_POLICY, ...partial };
}

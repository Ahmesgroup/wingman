import type { Clock } from "../clock.js";
import { isRadarVisible, type PresenceRecord } from "../presence/engine.js";

export type Gender = "MALE" | "FEMALE" | "NON_BINARY";
export type InterestTarget = "MEN" | "WOMEN" | "NON_BINARY_PEOPLE";

export interface RadarProfile {
  userId: string;
  gender: Gender;
  interestedIn: InterestTarget[];
  intention?: string;
  mood?: string;
  /** Optional durable profile fields (never exposed on Radar candidates). */
  firstName?: string;
  birthDate?: string;
  heightCm?: number;
  dailyBio?: string;
  interests?: string[];
}

/** Calendar age in full years (UTC date parts). */
export function ageYearsFromBirthDate(birthDateIso: string, now: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateIso.trim());
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  let age = now.getUTCFullYear() - y;
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  if (month < mo || (month === mo && day < d)) age -= 1;
  return age;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RadarCandidateView {
  userId: string;
  approximateDistanceBand: "NEAR" | "AROUND";
  mood?: string;
  intention?: string;
  // never expose exact lat/lng
}

export interface RadarQuery {
  viewerId: string;
  viewer: RadarProfile;
  viewerLocation: GeoPoint;
  nearRadiusM: number;
  aroundRadiusM: number;
  blockedUserIds: Set<string>;
}

function interestMatches(viewer: RadarProfile, other: RadarProfile): boolean {
  const genderToTarget = (g: Gender): InterestTarget => {
    if (g === "MALE") return "MEN";
    if (g === "FEMALE") return "WOMEN";
    return "NON_BINARY_PEOPLE";
  };
  const viewerWants = viewer.interestedIn.includes(genderToTarget(other.gender));
  const otherWants = other.interestedIn.includes(genderToTarget(viewer.gender));
  return viewerWants && otherWants;
}

/** Haversine distance in meters */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Quantize coordinates for storage/privacy (approx ~11m at equator for 4 decimals).
 * Exact coords must never leave the server in candidate payloads.
 */
export function protectPrecision(point: GeoPoint, decimals = 4): GeoPoint {
  const f = 10 ** decimals;
  return {
    lat: Math.round(point.lat * f) / f,
    lng: Math.round(point.lng * f) / f,
  };
}

export function buildRadarCandidates(
  query: RadarQuery,
  others: Array<{ profile: RadarProfile; location: GeoPoint; presence: PresenceRecord }>,
  clock: Clock,
): RadarCandidateView[] {
  const out: RadarCandidateView[] = [];
  for (const other of others) {
    if (other.profile.userId === query.viewerId) continue;
    if (query.blockedUserIds.has(other.profile.userId)) continue;
    if (!isRadarVisible(other.presence, clock)) continue;
    if (!interestMatches(query.viewer, other.profile)) continue;
    const d = distanceMeters(query.viewerLocation, other.location);
    if (d > query.aroundRadiusM) continue;
    out.push({
      userId: other.profile.userId,
      approximateDistanceBand: d <= query.nearRadiusM ? "NEAR" : "AROUND",
      mood: other.profile.mood,
      intention: other.profile.intention,
    });
  }
  return out;
}

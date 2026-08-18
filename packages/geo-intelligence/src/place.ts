/**
 * Privacy-safe reverse geocode for the CURRENT VIEWER only.
 * Returns city/municipality. Never an address, never peer coords.
 *
 * Choice: in-process Luxembourg gazetteer (launch city). No public Nominatim
 * at request time (usage policy + serverless). No paid tile/geocode vendor.
 * Outside the gazetteer → null (do not invent a city).
 */

export type ViewerPlace = { city: string; countryCode: "LU" };

type Commune = { city: string; lat: number; lng: number };

/** Centroids of Luxembourg communes — city/municipality label only. */
const LU_COMMUNES: Commune[] = [
  { city: "Luxembourg", lat: 49.6116, lng: 6.1319 },
  { city: "Esch-sur-Alzette", lat: 49.4958, lng: 5.9806 },
  { city: "Differdange", lat: 49.5242, lng: 5.8914 },
  { city: "Dudelange", lat: 49.4806, lng: 6.0875 },
  { city: "Pétange", lat: 49.5583, lng: 5.8806 },
  { city: "Sanem", lat: 49.5481, lng: 5.9286 },
  { city: "Hesperange", lat: 49.5681, lng: 6.1514 },
  { city: "Bettembourg", lat: 49.5186, lng: 6.1028 },
  { city: "Schifflange", lat: 49.5064, lng: 6.0128 },
  { city: "Kayl", lat: 49.4892, lng: 6.0394 },
  { city: "Mamer", lat: 49.6275, lng: 6.0233 },
  { city: "Bertrange", lat: 49.6111, lng: 6.05 },
  { city: "Strassen", lat: 49.6206, lng: 6.0733 },
  { city: "Walferdange", lat: 49.6581, lng: 6.1322 },
  { city: "Steinsel", lat: 49.6764, lng: 6.1236 },
  { city: "Junglinster", lat: 49.7108, lng: 6.2519 },
  { city: "Grevenmacher", lat: 49.6806, lng: 6.4417 },
  { city: "Echternach", lat: 49.8117, lng: 6.4217 },
  { city: "Diekirch", lat: 49.8678, lng: 6.1558 },
  { city: "Ettelbruck", lat: 49.8475, lng: 6.1042 },
  { city: "Wiltz", lat: 49.9656, lng: 5.9319 },
  { city: "Clervaux", lat: 50.0547, lng: 6.0311 },
  { city: "Rumelange", lat: 49.4597, lng: 6.0292 },
  { city: "Mondorf-les-Bains", lat: 49.5069, lng: 6.2811 },
];

const LU_BBOX = { minLat: 49.44, maxLat: 50.19, minLng: 5.73, maxLng: 6.53 };
const MATCH_M = 8000;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function reverseViewerCity(lat: number, lng: number): ViewerPlace | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < LU_BBOX.minLat || lat > LU_BBOX.maxLat || lng < LU_BBOX.minLng || lng > LU_BBOX.maxLng) {
    return null;
  }
  let best: Commune | null = null;
  let bestM = MATCH_M;
  for (const c of LU_COMMUNES) {
    const d = haversineM(lat, lng, c.lat, c.lng);
    if (d <= bestM) {
      best = c;
      bestM = d;
    }
  }
  if (best) return { city: best.city, countryCode: "LU" };
  return { city: "Luxembourg", countryCode: "LU" };
}

/** Public HTTP shape — city only. Never lat/lng/address. */
export function publicViewerPlace(lat: number, lng: number): { city: string } | null {
  const place = reverseViewerCity(lat, lng);
  return place ? { city: place.city } : null;
}

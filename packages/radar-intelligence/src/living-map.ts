import { createHash } from "node:crypto";

/** Master switch — false keeps certifiable canvas Radar as the public product. */
export function isLivingMapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WINGMAN_LIVING_MAP_V1 === "true";
}

export const LIVING_MAP_VERSION = "1.0.0";
export const MAX_PUBLIC_OPPORTUNITIES = 100;
/** Pulse k-anonymity — below this, only the quiet message is returned. */
export const PULSE_MIN_THRESHOLD = 5;

export const VERY_CLOSE_M = 25;

export type LivingDistanceBand = "VERY_CLOSE" | "NEARBY" | "AROUND_ME";
export type BearingBucket = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type MoodState = "SUPER_READY" | "OPEN" | "EXPLORING";
export type IntentionState = "AVAILABLE_NOW" | "JUST_EXPLORING";
export type PresenceState = "AVAILABLE" | "BUSY" | "UNAVAILABLE" | "INVISIBLE";

export interface DisplayZone {
  ring: LivingDistanceBand;
  sector: BearingBucket;
}

export interface OpportunityPublic {
  opportunityId: string;
  /** Existing Signal API target — never rendered as a label. */
  userId: string;
  distanceBand: LivingDistanceBand;
  bearingBucket: BearingBucket;
  displayZone: DisplayZone;
  presenceState: PresenceState;
  moodState: MoodState;
  intention?: IntentionState;
  contextTags: string[];
  expiresAt?: string;
  destiny: boolean;
}

export interface DensityCluster {
  distanceBand: LivingDistanceBand;
  bearingBucket: BearingBucket;
  displayZone: DisplayZone;
  count: number;
}

export interface LivingMapFilters {
  proximity?: LivingDistanceBand[];
  presence?: MoodState[];
  intention?: IntentionState[];
  interests?: string[];
}

export interface OpportunityProjectInput {
  viewerId: string;
  otherId: string;
  meters: number;
  bearingDeg: number;
  nearM?: number;
  aroundM?: number;
  mood?: string;
  intention?: string;
  interests?: string[];
  expiresAt?: Date;
  destiny?: boolean;
  visibility?: string;
}

export interface PulsePublic {
  quiet: boolean;
  message: string;
  peopleActive?: "few" | "some" | "busy";
  opportunityCount?: number;
  presence?: { superReady?: number; open?: number; exploring?: number };
  context?: string[];
  trend?: "quiet" | "steady" | "rising";
  destinyCount?: number;
}

const BEARING_ORDER: BearingBucket[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function opportunityIdFor(viewerId: string, otherId: string): string {
  return createHash("sha256")
    .update(`opp:${viewerId}:${otherId}`)
    .digest("hex")
    .slice(0, 16);
}

export function bandFromMeters(
  meters: number,
  nearM = 50,
  aroundM = 200,
): LivingDistanceBand | undefined {
  if (!Number.isFinite(meters) || meters < 0) return undefined;
  if (meters > aroundM) return undefined;
  if (meters <= VERY_CLOSE_M) return "VERY_CLOSE";
  if (meters <= nearM) return "NEARBY";
  return "AROUND_ME";
}

/** 8-sector coarse bearing — never exact degrees on the wire. */
export function bearingBucketFromDeg(deg: number): BearingBucket {
  const n = ((deg % 360) + 360) % 360;
  const idx = Math.round(n / 45) % 8;
  return BEARING_ORDER[idx]!;
}

export function bearingDegrees(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function normalizeMood(mood?: string): MoodState {
  if (mood === "SUPER_READY") return "SUPER_READY";
  if (mood === "EXPLORING" || mood === "UNSURE") return "EXPLORING";
  return "OPEN";
}

export function normalizeIntention(intention?: string): IntentionState | undefined {
  if (intention === "AVAILABLE_NOW" || intention === "JUST_EXPLORING") return intention;
  return undefined;
}

export function normalizePresence(visibility?: string): PresenceState {
  if (visibility === "BUSY") return "BUSY";
  if (visibility === "UNAVAILABLE") return "UNAVAILABLE";
  if (visibility === "INVISIBLE") return "INVISIBLE";
  return "AVAILABLE";
}

const TAG_MAX = 5;
const TAG_LEN = 40;

export function sanitizeContextTags(interests?: string[]): string[] {
  if (!Array.isArray(interests)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of interests) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().slice(0, TAG_LEN);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= TAG_MAX) break;
  }
  return out;
}

export function projectOpportunity(input: OpportunityProjectInput): OpportunityPublic {
  const distanceBand = bandFromMeters(input.meters, input.nearM, input.aroundM) ?? "AROUND_ME";
  const bearingBucket = bearingBucketFromDeg(input.bearingDeg);
  const moodState = normalizeMood(input.mood);
  const intention = normalizeIntention(input.intention);
  const out: OpportunityPublic = {
    opportunityId: opportunityIdFor(input.viewerId, input.otherId),
    userId: input.otherId,
    distanceBand,
    bearingBucket,
    displayZone: { ring: distanceBand, sector: bearingBucket },
    presenceState: normalizePresence(input.visibility),
    moodState,
    contextTags: sanitizeContextTags(input.interests),
    destiny: Boolean(input.destiny),
  };
  if (intention) out.intention = intention;
  if (input.expiresAt) out.expiresAt = input.expiresAt.toISOString();
  return out;
}

export function parseCsvEnum<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!raw || !raw.trim()) return undefined;
  const set = new Set<T>(allowed);
  const out: T[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim() as T;
    if (set.has(v) && !out.includes(v)) out.push(v);
  }
  return out.length ? out : undefined;
}

export function parseFilters(query: {
  proximity?: string;
  presence?: string;
  intention?: string;
  interests?: string;
}): LivingMapFilters {
  return {
    proximity: parseCsvEnum(query.proximity, ["VERY_CLOSE", "NEARBY", "AROUND_ME"] as const),
    presence: parseCsvEnum(query.presence, ["SUPER_READY", "OPEN", "EXPLORING"] as const),
    intention: parseCsvEnum(query.intention, ["AVAILABLE_NOW", "JUST_EXPLORING"] as const),
    interests: query.interests
      ? query.interests
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, TAG_MAX)
      : undefined,
  };
}

/**
 * Filters only REDUCE the already-authorized set.
 * Missing filter dimensions = no extra constraint.
 */
export function filterOpportunities(
  list: OpportunityPublic[],
  filters: LivingMapFilters = {},
): OpportunityPublic[] {
  return list.filter((o) => {
    if (filters.proximity?.length && !filters.proximity.includes(o.distanceBand)) return false;
    if (filters.presence?.length && !filters.presence.includes(o.moodState)) return false;
    if (filters.intention?.length) {
      if (!o.intention || !filters.intention.includes(o.intention)) return false;
    }
    if (filters.interests?.length) {
      const have = new Set(o.contextTags.map((t) => t.toLowerCase()));
      if (!filters.interests.some((t) => have.has(t.toLowerCase()))) return false;
    }
    return true;
  });
}

export function boundOpportunities(list: OpportunityPublic[]): {
  opportunities: OpportunityPublic[];
  clusters: DensityCluster[];
  truncated: boolean;
} {
  if (list.length <= MAX_PUBLIC_OPPORTUNITIES) {
    return { opportunities: list, clusters: [], truncated: false };
  }
  const head = list.slice(0, MAX_PUBLIC_OPPORTUNITIES);
  const rest = list.slice(MAX_PUBLIC_OPPORTUNITIES);
  const buckets = new Map<string, DensityCluster>();
  for (const o of rest) {
    const key = `${o.distanceBand}:${o.bearingBucket}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, {
        distanceBand: o.distanceBand,
        bearingBucket: o.bearingBucket,
        displayZone: { ring: o.distanceBand, sector: o.bearingBucket },
        count: 1,
      });
    }
  }
  return { opportunities: head, clusters: [...buckets.values()], truncated: true };
}

export function quietPulse(message = "Activity is quiet nearby"): PulsePublic {
  return { quiet: true, message };
}

export function aggregatePulse(
  opportunities: OpportunityPublic[],
  threshold = PULSE_MIN_THRESHOLD,
): PulsePublic {
  const n = opportunities.length;
  if (n < threshold) return quietPulse();

  let peopleActive: "few" | "some" | "busy" = "few";
  if (n >= 40) peopleActive = "busy";
  else if (n >= 12) peopleActive = "some";

  const mood = { superReady: 0, open: 0, exploring: 0 };
  const tagCounts = new Map<string, number>();
  let destinyCount = 0;
  for (const o of opportunities) {
    if (o.moodState === "SUPER_READY") mood.superReady += 1;
    else if (o.moodState === "EXPLORING") mood.exploring += 1;
    else mood.open += 1;
    if (o.destiny) destinyCount += 1;
    for (const tag of o.contextTags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const presence: PulsePublic["presence"] = {};
  if (mood.superReady >= threshold) presence.superReady = mood.superReady;
  if (mood.open >= threshold) presence.open = mood.open;
  if (mood.exploring >= threshold) presence.exploring = mood.exploring;

  const context = [...tagCounts.entries()]
    .filter(([, c]) => c >= threshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
    .slice(0, TAG_MAX);

  const out: PulsePublic = {
    quiet: false,
    message: n >= 40 ? "The area is active" : "People are active nearby",
    peopleActive,
    opportunityCount: n,
    trend: n >= 40 ? "rising" : "steady",
  };
  if (Object.keys(presence).length) out.presence = presence;
  if (context.length) out.context = context;
  if (destinyCount >= threshold) out.destinyCount = destinyCount;
  return out;
}

const COORD_KEY = /"(lat|lng|latitude|longitude|exactMeters|meters|coordinates|path)"\s*:/i;

/** True if a JSON payload would leak peer coordinates or trails. */
export function payloadLeaksCoordinates(value: unknown): boolean {
  if (value == null) return false;
  return COORD_KEY.test(JSON.stringify(value));
}

export function assertPrivacySafeOpportunity(o: OpportunityPublic): void {
  if (payloadLeaksCoordinates(o)) {
    throw new Error("LIVING_MAP_PRIVACY: opportunity leaked coordinates");
  }
  if (!o.opportunityId || !o.distanceBand || !o.bearingBucket || !o.displayZone) {
    throw new Error("LIVING_MAP_PRIVACY: incomplete opportunity");
  }
}

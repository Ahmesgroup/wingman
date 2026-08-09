import type {
  ContextConfidence,
  ContextRawHints,
  ContextSnapshot,
  IntentionHint,
  MobilityHint,
  MoodHint,
  NormalizedContextFields,
} from "./types.js";
import { CONTEXT_ENGINE_NAME, CONTEXT_ENGINE_VERSION, FIELD_META } from "./types.js";

const EPHEMERAL_TTL_MS = 20 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const STABLE_TTL_MS = 24 * 60 * 60 * 1000;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalizeLang(code: string): string | undefined {
  const t = code.trim().toLowerCase().slice(0, 8);
  if (!/^[a-z]{2}(-[a-z0-9]+)?$/.test(t)) return undefined;
  return t.split("-")[0];
}

function normalizeMobility(raw?: string): MobilityHint | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "stationary" || v === "still") return "stationary";
  if (v === "walking" || v === "on_foot") return "walking";
  if (v === "transit" || v === "vehicle" || v === "moving") return "transit";
  if (v === "unknown") return "unknown";
  return undefined;
}

function normalizeIntention(raw?: string): IntentionHint | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (v === "social" || v === "available_now" || v === "available") return v === "available" ? "available_now" : (v as IntentionHint);
  if (v === "exploring" || v === "just_exploring") return "exploring";
  if (v === "unknown") return "unknown";
  return undefined;
}

function normalizeMood(raw?: string): MoodHint | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (v === "open") return "open";
  if (v === "super_ready" || v === "super-ready") return "super_ready";
  if (v === "exploring") return "exploring";
  if (v === "unknown") return "unknown";
  return undefined;
}

function freshnessFromHints(hints: ContextRawHints): { value?: number; confidence: number } {
  if (hints.presenceRemainingMs !== undefined && hints.presenceRemainingMs >= 0) {
    const value = clamp01(hints.presenceRemainingMs / 120_000);
    return { value, confidence: hints.freshnessConfidence ?? 0.85 };
  }
  if (hints.heartbeatAgeMs !== undefined && hints.heartbeatAgeMs >= 0) {
    const value = clamp01(1 - hints.heartbeatAgeMs / 120_000);
    return { value, confidence: hints.freshnessConfidence ?? 0.7 };
  }
  return { confidence: 0 };
}

/**
 * Pure normalization — deterministic for same hints + same `now`.
 * Never includes coordinates. Never decides eligibility.
 */
export function normalizeContext(hints: ContextRawHints, now: Date): ContextSnapshot {
  const capturedAt = hints.capturedAt ?? now;
  const context: NormalizedContextFields = {};
  const confidence: ContextConfidence = {};

  const langs = [...new Set((hints.languages ?? []).map(normalizeLang).filter(Boolean) as string[])].sort();
  if (langs.length) {
    context.languages = langs;
    confidence.languages = clamp01(hints.languagesConfidence ?? 1);
  }

  if (hints.availabilityMinutes !== undefined && Number.isFinite(hints.availabilityMinutes)) {
    const mins = Math.max(0, Math.min(240, Math.round(hints.availabilityMinutes)));
    context.availabilityMinutes = mins;
    confidence.availabilityMinutes = clamp01(hints.availabilityConfidence ?? 0.9);
  }

  const mobility = normalizeMobility(hints.mobility);
  if (mobility && mobility !== "unknown") {
    context.mobility = mobility;
    confidence.mobility = clamp01(hints.mobilityConfidence ?? 0.7);
  }

  const intention = normalizeIntention(hints.intention);
  if (intention && intention !== "unknown") {
    context.intention = intention;
    confidence.intention = clamp01(hints.intentionConfidence ?? 0.8);
  }

  const mood = normalizeMood(hints.mood);
  if (mood && mood !== "unknown") {
    context.mood = mood;
    confidence.mood = clamp01(hints.moodConfidence ?? 0.6);
  }

  const fresh = freshnessFromHints(hints);
  if (fresh.value !== undefined) {
    context.freshness = Math.round(fresh.value * 1000) / 1000;
    confidence.freshness = clamp01(fresh.confidence);
  }

  // TTL: shortest among present tiers (ephemeral dominates when present)
  let ttl = STABLE_TTL_MS;
  if (context.intention !== undefined || context.mood !== undefined) ttl = Math.min(ttl, SESSION_TTL_MS);
  if (
    context.availabilityMinutes !== undefined ||
    context.mobility !== undefined ||
    context.freshness !== undefined
  ) {
    ttl = Math.min(ttl, EPHEMERAL_TTL_MS);
  }
  if (Object.keys(context).length === 0) ttl = EPHEMERAL_TTL_MS;

  const expiresAt = new Date(capturedAt.getTime() + ttl);

  return {
    userId: hints.userId,
    capturedAt: capturedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    context,
    confidence,
    engine: CONTEXT_ENGINE_NAME,
    version: CONTEXT_ENGINE_VERSION,
  };
}

/** Drop fields below usable confidence — consumers treat absence as neutral. */
export function usableContext(snapshot: ContextSnapshot, now: Date): ContextSnapshot | undefined {
  if (now.getTime() >= new Date(snapshot.expiresAt).getTime()) return undefined;

  const context: NormalizedContextFields = {};
  const confidence: ContextConfidence = {};

  (Object.keys(FIELD_META) as (keyof NormalizedContextFields)[]).forEach((key) => {
    const value = snapshot.context[key];
    if (value === undefined) return;
    const conf = snapshot.confidence[key] ?? 0;
    if (conf < FIELD_META[key].minUsableConfidence) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context as any)[key] = value;
    confidence[key] = conf;
  });

  if (Object.keys(context).length === 0) return undefined;

  return { ...snapshot, context, confidence };
}

/** Shared-language helper: unknown language is neutral (not incompatible). */
export function sharedLanguages(
  a?: ContextSnapshot,
  b?: ContextSnapshot,
): { shared: string[]; usable: boolean } {
  const la = a?.context.languages;
  const lb = b?.context.languages;
  if (!la?.length || !lb?.length) return { shared: [], usable: false };
  const ca = a!.confidence.languages ?? 0;
  const cb = b!.confidence.languages ?? 0;
  if (ca < FIELD_META.languages.minUsableConfidence || cb < FIELD_META.languages.minUsableConfidence) {
    return { shared: [], usable: false };
  }
  const setB = new Set(lb);
  const shared = la.filter((l) => setB.has(l));
  return { shared, usable: shared.length > 0 };
}

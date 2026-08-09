/** Feature flag — when false, consumers must behave as pre-S22 (S21 legacy enrichment). */
export function isContextEngineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CONTEXT_ENGINE_ENABLED === "true";
}

export const CONTEXT_ENGINE_VERSION = "1.1.0";
export const CONTEXT_ENGINE_NAME = "CONTEXT_ENGINE";

/** Durability tier — never persist ephemeral as profile identity. */
export type ContextTier = "stable" | "session" | "ephemeral";

export type MobilityHint = "stationary" | "walking" | "transit" | "unknown";
export type IntentionHint = "social" | "exploring" | "available_now" | "unknown";
export type MoodHint = "open" | "super_ready" | "exploring" | "unknown";

/**
 * Raw hints from profile / session / presence / device.
 * MUST NOT include exact lat/lng — Geo Engine owns spatial precision later.
 */
export interface ContextRawHints {
  userId: string;
  /** Stable — known languages (BCP47-ish short codes) */
  languages?: string[];
  languagesConfidence?: number;
  /** Session — current intention / mood */
  intention?: string;
  intentionConfidence?: number;
  mood?: string;
  moodConfidence?: number;
  /** Ephemeral — minutes of availability remaining */
  availabilityMinutes?: number;
  availabilityConfidence?: number;
  /** Ephemeral — coarse mobility class (never GPS) */
  mobility?: string;
  mobilityConfidence?: number;
  /** Ephemeral — heartbeat / presence freshness */
  presenceRemainingMs?: number;
  heartbeatAgeMs?: number;
  freshnessConfidence?: number;
  capturedAt?: Date;
}

export interface NormalizedContextFields {
  languages?: string[];
  availabilityMinutes?: number;
  mobility?: MobilityHint;
  intention?: IntentionHint;
  mood?: MoodHint;
  /** Derived freshness signal 0..1 when known */
  freshness?: number;
}

export type ContextFieldKey = keyof NormalizedContextFields;

export interface ContextConfidence {
  languages?: number;
  availabilityMinutes?: number;
  mobility?: number;
  intention?: number;
  mood?: number;
  freshness?: number;
}

export interface ContextFieldMeta {
  tier: ContextTier;
  /** Below this, consumers must treat field as unknown (neutral). */
  minUsableConfidence: number;
}

export const FIELD_META: Record<ContextFieldKey, ContextFieldMeta> = {
  languages: { tier: "stable", minUsableConfidence: 0.5 },
  availabilityMinutes: { tier: "ephemeral", minUsableConfidence: 0.5 },
  mobility: { tier: "ephemeral", minUsableConfidence: 0.5 },
  intention: { tier: "session", minUsableConfidence: 0.5 },
  mood: { tier: "session", minUsableConfidence: 0.5 },
  freshness: { tier: "ephemeral", minUsableConfidence: 0.4 },
};

/** Normalized ephemeral context — describes situation, never decides eligibility. */
export interface ContextSnapshot {
  userId: string;
  capturedAt: string;
  expiresAt: string;
  context: NormalizedContextFields;
  confidence: ContextConfidence;
  engine: typeof CONTEXT_ENGINE_NAME;
  version: typeof CONTEXT_ENGINE_VERSION;
}

/**
 * Port for feeding raw hints into the engine.
 * Implementations live in Nest/adapters — not in domain.
 */
export interface ContextInputsPort {
  getRawHints(userId: string, now: Date): ContextRawHints | undefined;
}

/**
 * Read port for consumers (Radar S21, Destiny S23, Geo S25).
 * Consumers depend on this contract, not on MemoryContextEngine internals.
 */
export interface ContextReaderPort {
  /**
   * Returns a usable snapshot or undefined if disabled / expired / empty.
   * Missing fields are omitted — never fabricated as incompatibility.
   */
  getSnapshot(userId: string, now: Date): ContextSnapshot | undefined;
}

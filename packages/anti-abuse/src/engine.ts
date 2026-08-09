import { randomUUID } from "node:crypto";
import { applyAbusePolicy, scopesBlock } from "./policy.js";
import { deriveRiskSignals } from "./risk.js";
import type { AbuseStateStore } from "./store.js";
import type {
  AbuseAction,
  AbuseEvent,
  AbuseEventKind,
  ActiveSanction,
  EnforcementScope,
  PolicyThresholds,
  RiskDecision,
} from "./types.js";
import {
  ACTION_RANK,
  ANTI_ABUSE_ENGINE,
  ANTI_ABUSE_VERSION,
  DEFAULT_POLICY_THRESHOLDS,
} from "./types.js";
import { AntiAbuseError, type AntiAbuseErrorCode } from "./errors.js";

export interface ObserveInput {
  kind: AbuseEventKind;
  actorId: string;
  subjectId?: string;
  at: Date;
  meta?: Record<string, string | number | boolean>;
  /** Stable id for replay safety — defaults to random UUID */
  eventId?: string;
}

export interface EvaluateOptions {
  enforcementEnabled: boolean;
  thresholds?: PolicyThresholds;
  /** Lookback for observation window (ms) */
  lookbackMs?: number;
}

const LOOKBACK_DEFAULT_MS = 24 * 60 * 60 * 1000;

/**
 * Anti-Abuse facade — observe → risk signals → policy → optional sanction.
 * Never mutates Radar / Signal / Destiny / V1 domain rules.
 */
export class AntiAbuseEngine {
  constructor(
    private readonly store: AbuseStateStore,
    private readonly thresholds: PolicyThresholds = DEFAULT_POLICY_THRESHOLDS,
  ) {}

  getStore(): AbuseStateStore {
    return this.store;
  }

  /**
   * Record a behavioral event. Replay of the same eventId is a no-op (no double penalty).
   */
  observe(input: ObserveInput): { event: AbuseEvent; replay: boolean } {
    const id = input.eventId ?? randomUUID();
    if (this.store.hasEventId(id)) {
      return {
        event: {
          id,
          kind: input.kind,
          actorId: input.actorId,
          subjectId: input.subjectId,
          at: input.at,
          meta: input.meta,
        },
        replay: true,
      };
    }
    const event: AbuseEvent = {
      id,
      kind: input.kind,
      actorId: input.actorId,
      subjectId: input.subjectId,
      at: input.at,
      meta: input.meta,
    };
    this.store.appendEvent(event);
    return { event, replay: false };
  }

  /**
   * Evaluate risk after observation. When enforcementEnabled, may write a sanction.
   * Replay of evaluate for same eventId does not upgrade/stack if already sanctioned from it.
   */
  evaluate(actorId: string, now: Date, opts: EvaluateOptions): RiskDecision {
    const thresholds = opts.thresholds ?? this.thresholds;
    const lookback = opts.lookbackMs ?? LOOKBACK_DEFAULT_MS;
    const since = new Date(now.getTime() - lookback);
    const events = this.store.listEvents(actorId, since, now);
    const signals = deriveRiskSignals(events, now, thresholds);
    const policy = applyAbusePolicy(signals, thresholds);
    const decisionId = randomUUID();
    const shadow = !opts.enforcementEnabled;

    const decision: RiskDecision = {
      signals,
      riskLevel: policy.riskLevel,
      policyVersion: policy.policyVersion,
      action: policy.action,
      scopes: policy.scopes,
      reasons: policy.reasons,
      durationMs: policy.durationMs,
      shadow,
      decisionId,
      at: now.toISOString(),
      engine: ANTI_ABUSE_ENGINE,
      version: ANTI_ABUSE_VERSION,
    };

    if (!opts.enforcementEnabled) return decision;
    if (policy.action === "ALLOW" || policy.action === "REVIEW") return decision;
    if (policy.durationMs <= 0) return decision;

    const existing = this.store.getSanction(actorId, now);
    // Do not stack: only replace if new action is strictly stronger
    if (existing && ACTION_RANK[policy.action] <= ACTION_RANK[existing.action]) {
      return decision;
    }

    const sanction: ActiveSanction = {
      userId: actorId,
      action: policy.action,
      scopes: policy.scopes.length ? policy.scopes : ["ALL"],
      reasons: signals,
      riskLevel: policy.riskLevel,
      policyVersion: policy.policyVersion,
      createdAt: now,
      expiresAt: new Date(now.getTime() + policy.durationMs),
      sourceEventId: decisionId,
    };
    this.store.setSanction(sanction);
    return decision;
  }

  /**
   * Observe then evaluate in one step. Replay of eventId skips re-evaluation penalty stacking.
   */
  observeAndEvaluate(input: ObserveInput, opts: EvaluateOptions): RiskDecision {
    const { event, replay } = this.observe(input);
    if (replay) {
      // Recompute decision for audit but do not re-apply sanction from replay
      const decision = this.evaluate(input.actorId, input.at, {
        ...opts,
        enforcementEnabled: false,
      });
      return { ...decision, shadow: !opts.enforcementEnabled, reasons: [...decision.reasons, "replay_ignored"] };
    }
    void event;
    return this.evaluate(input.actorId, input.at, opts);
  }

  /**
   * Gate a user action. Throws AntiAbuseError when enforcement applies.
   * Shadow / disabled callers should not invoke this.
   */
  assertAllowed(userId: string, scope: EnforcementScope, now: Date): void {
    const sanction = this.store.getSanction(userId, now);
    if (!sanction) return;
    if (!scopesBlock(sanction.scopes, scope)) return;
    if (sanction.action === "ALLOW" || sanction.action === "REVIEW") return;

    const code = actionToErrorCode(sanction.action);
    throw new AntiAbuseError(code, `Anti-abuse ${sanction.action} active`, {
      action: sanction.action,
      scopes: sanction.scopes,
      expiresAt: sanction.expiresAt.toISOString(),
      // reasons kept for server logs — Nest must strip from public if needed
      policyVersion: sanction.policyVersion,
    });
  }

  getPublicSanctionView(userId: string, now: Date): {
    action: AbuseAction;
    expiresAt: string;
  } | null {
    const s = this.store.getSanction(userId, now);
    if (!s || s.action === "ALLOW" || s.action === "REVIEW") return null;
    return { action: s.action, expiresAt: s.expiresAt.toISOString() };
  }
}

function actionToErrorCode(action: AbuseAction): AntiAbuseErrorCode {
  switch (action) {
    case "SLOW_DOWN":
      return "ABUSE_SLOW_DOWN";
    case "COOLDOWN":
      return "ABUSE_COOLDOWN";
    case "CHALLENGE":
      return "ABUSE_CHALLENGE";
    case "TEMP_RESTRICT":
      return "ABUSE_TEMP_RESTRICT";
    default:
      return "ABUSE_COOLDOWN";
  }
}

export { scopesBlock };

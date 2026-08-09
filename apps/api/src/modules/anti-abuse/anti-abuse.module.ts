import { Global, Inject, Injectable, Module, Optional } from "@nestjs/common";
import {
  AntiAbuseEngine,
  MemoryAbuseStateStore,
  isAntiAbuseEnabled,
  isAntiAbuseEnforcementEnabled,
  type AbuseEventKind,
  type EnforcementScope,
  type RiskDecision,
} from "@wingman/anti-abuse";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import type { WingmanEngine } from "@wingman/domain";
import { ANTI_ABUSE_ENGINE, ANTI_ABUSE_STORE } from "./anti-abuse.tokens.js";

let storeOverride: MemoryAbuseStateStore | undefined;
let engineOverride: AntiAbuseEngine | undefined;

export function setAntiAbuseOverrides(opts: {
  store?: MemoryAbuseStateStore;
  engine?: AntiAbuseEngine;
}): void {
  storeOverride = opts.store;
  engineOverride = opts.engine;
}

/**
 * Nest boundary gate — observes Radar/Signal/Destiny/Safety/Auth without changing domain rules.
 */
@Injectable()
export class AntiAbuseGate {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly wingman: WingmanEngine,
    @Optional() @Inject(ANTI_ABUSE_ENGINE) private readonly engine?: AntiAbuseEngine,
  ) {}

  private active(): AntiAbuseEngine | undefined {
    if (!isAntiAbuseEnabled() || !this.engine) return undefined;
    return this.engine;
  }

  private enforcement(): boolean {
    return isAntiAbuseEnforcementEnabled();
  }

  private now(): Date {
    return this.wingman.clock.now();
  }

  /**
   * Pre-check before a scoped action. No-op when flag off or shadow.
   */
  assertAllowed(userId: string, scope: EnforcementScope): void {
    const eng = this.active();
    if (!eng || !this.enforcement()) return;
    eng.assertAllowed(userId, scope, this.now());
  }

  /**
   * Observe an event; optionally enforce after evaluation.
   * Returns decision for server audit (never attach full reasons to public HTTP).
   */
  note(
    kind: AbuseEventKind,
    actorId: string,
    opts?: {
      subjectId?: string;
      eventId?: string;
      meta?: Record<string, string | number | boolean>;
      /** When true, evaluate+maybe sanction after observe */
      evaluate?: boolean;
    },
  ): RiskDecision | undefined {
    const eng = this.active();
    if (!eng) return undefined;
    const at = this.now();
    if (opts?.evaluate === false) {
      eng.observe({
        kind,
        actorId,
        subjectId: opts?.subjectId,
        at,
        eventId: opts?.eventId,
        meta: opts?.meta,
      });
      return undefined;
    }
    return eng.observeAndEvaluate(
      {
        kind,
        actorId,
        subjectId: opts?.subjectId,
        at,
        eventId: opts?.eventId,
        meta: opts?.meta,
      },
      { enforcementEnabled: this.enforcement() },
    );
  }

  /** Record block on both actor and target (target gets block_received). */
  noteBlock(blockerId: string, blockedId: string): void {
    const eng = this.active();
    if (!eng) return;
    const at = this.now();
    eng.observeAndEvaluate(
      {
        kind: "safety.block_issued",
        actorId: blockerId,
        subjectId: blockedId,
        at,
        eventId: `block-iss:${blockerId}:${blockedId}:${at.toISOString()}`,
      },
      { enforcementEnabled: this.enforcement() },
    );
    eng.observeAndEvaluate(
      {
        kind: "safety.block_received",
        actorId: blockedId,
        subjectId: blockerId,
        at,
        eventId: `block-rcv:${blockedId}:${blockerId}:${at.toISOString()}`,
      },
      { enforcementEnabled: this.enforcement() },
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: ANTI_ABUSE_STORE,
      useFactory: () => storeOverride ?? new MemoryAbuseStateStore(),
    },
    {
      provide: ANTI_ABUSE_ENGINE,
      useFactory: (store: MemoryAbuseStateStore) =>
        engineOverride ?? new AntiAbuseEngine(store),
      inject: [ANTI_ABUSE_STORE],
    },
    AntiAbuseGate,
  ],
  exports: [AntiAbuseGate, ANTI_ABUSE_ENGINE, ANTI_ABUSE_STORE],
})
export class AntiAbuseModule {}

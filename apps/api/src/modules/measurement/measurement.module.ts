import { Global, Inject, Injectable, Module, Optional } from "@nestjs/common";
import {
  MeasurementEngine,
  MemoryMeasurementStore,
  captureFlagSnapshot,
  hashActorKey,
  isMeasurementEnabled,
  isMeasurementLearningEnabled,
  MeasurementLearningForbiddenError,
  type DecisionKind,
  type MeasuredEngine,
  type MeasurementReport,
  type OutcomeKind,
} from "@wingman/measurement";
import type { WingmanEngine } from "@wingman/domain";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { MEASUREMENT_ENGINE, MEASUREMENT_STORE } from "./measurement.tokens.js";

let storeOverride: MemoryMeasurementStore | undefined;
let engineOverride: MeasurementEngine | undefined;

export function setMeasurementOverrides(opts: {
  store?: MemoryMeasurementStore;
  engine?: MeasurementEngine;
}): void {
  storeOverride = opts.store;
  engineOverride = opts.engine;
}

/**
 * Nest boundary — observe engine decisions/outcomes without changing business rules.
 * Measurement observes; it never decides (no feedback into S21–S25 engines).
 */
@Injectable()
export class MeasurementGate {
  /** actorKey → last radar impression epoch ms (time-to-signal) */
  private readonly lastRadarAt = new Map<string, number>();

  constructor(
    @Inject(WINGMAN_ENGINE) private readonly wingman: WingmanEngine,
    @Optional() @Inject(MEASUREMENT_ENGINE) private readonly engine?: MeasurementEngine,
  ) {}

  private active(): MeasurementEngine | undefined {
    if (!isMeasurementEnabled() || !this.engine) return undefined;
    if (isMeasurementLearningEnabled()) {
      throw new MeasurementLearningForbiddenError();
    }
    return this.engine;
  }

  private now(): Date {
    return this.wingman.clock.now();
  }

  /** Record radar impression timestamp for time-to-signal (observe-only). */
  markRadarImpression(actorId: string): void {
    if (!this.active()) return;
    this.lastRadarAt.set(hashActorKey(actorId), this.now().getTime());
  }

  /** Consume latency since last radar impression for this actor, if any. */
  takeTimeToSignalMs(actorId: string): number | undefined {
    if (!this.active()) return undefined;
    const key = hashActorKey(actorId);
    const at = this.lastRadarAt.get(key);
    if (at === undefined) return undefined;
    this.lastRadarAt.delete(key);
    return Math.max(0, this.now().getTime() - at);
  }

  noteDecision(
    engine: MeasuredEngine,
    engineVersion: string,
    kind: DecisionKind,
    opts?: { reasons?: string[]; actorId?: string; meta?: Record<string, string | number | boolean> },
  ): string | undefined {
    const m = this.active();
    if (!m) return undefined;
    const rec = m.recordDecision({
      engine,
      engineVersion,
      kind,
      reasons: opts?.reasons,
      at: this.now(),
      actorKey: opts?.actorId ? hashActorKey(opts.actorId) : undefined,
      meta: opts?.meta,
      flags: captureFlagSnapshot(),
    });
    return rec.id;
  }

  noteOutcome(
    kind: OutcomeKind,
    opts?: { decisionId?: string; meta?: Record<string, string | number | boolean> },
  ): void {
    const m = this.active();
    if (!m) return;
    m.recordOutcome({
      kind,
      at: this.now(),
      decisionId: opts?.decisionId,
      meta: opts?.meta,
    });
  }

  report(from?: Date, to?: Date): MeasurementReport | { enabled: false } {
    const m = this.active();
    if (!m) return { enabled: false };
    const end = to ?? this.now();
    const start = from ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return m.report(start, end);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: MEASUREMENT_STORE,
      useFactory: () => storeOverride ?? new MemoryMeasurementStore(),
    },
    {
      provide: MEASUREMENT_ENGINE,
      useFactory: (store: MemoryMeasurementStore) => {
        if (engineOverride) return engineOverride;
        if (isMeasurementLearningEnabled()) {
          throw new MeasurementLearningForbiddenError();
        }
        return new MeasurementEngine(store);
      },
      inject: [MEASUREMENT_STORE],
    },
    MeasurementGate,
  ],
  exports: [MeasurementGate, MEASUREMENT_ENGINE, MEASUREMENT_STORE],
})
export class MeasurementModule {}

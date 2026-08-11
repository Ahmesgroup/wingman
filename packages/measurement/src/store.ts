import type { DecisionRecord, OutcomeRecord } from "./types.js";

export interface MeasurementStore {
  appendDecision(d: DecisionRecord): void;
  appendOutcome(o: OutcomeRecord): void;
  listDecisions(from: Date, to: Date): DecisionRecord[];
  listOutcomes(from: Date, to: Date): OutcomeRecord[];
  clear(): void;
}

export class MemoryMeasurementStore implements MeasurementStore {
  private decisions: DecisionRecord[] = [];
  private outcomes: OutcomeRecord[] = [];

  appendDecision(d: DecisionRecord): void {
    this.decisions.push(d);
    if (this.decisions.length > 10_000) this.decisions.splice(0, this.decisions.length - 10_000);
  }

  appendOutcome(o: OutcomeRecord): void {
    this.outcomes.push(o);
    if (this.outcomes.length > 10_000) this.outcomes.splice(0, this.outcomes.length - 10_000);
  }

  listDecisions(from: Date, to: Date): DecisionRecord[] {
    const a = from.getTime();
    const b = to.getTime();
    return this.decisions.filter((d) => {
      const t = Date.parse(d.at);
      return t >= a && t <= b;
    });
  }

  listOutcomes(from: Date, to: Date): OutcomeRecord[] {
    const a = from.getTime();
    const b = to.getTime();
    return this.outcomes.filter((o) => {
      const t = Date.parse(o.at);
      return t >= a && t <= b;
    });
  }

  clear(): void {
    this.decisions = [];
    this.outcomes = [];
  }
}

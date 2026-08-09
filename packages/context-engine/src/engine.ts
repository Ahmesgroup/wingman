import { normalizeContext, usableContext } from "./normalize.js";
import type {
  ContextInputsPort,
  ContextRawHints,
  ContextReaderPort,
  ContextSnapshot,
} from "./types.js";
import { isContextEngineEnabled } from "./types.js";

/**
 * Context Engine — normalizes hints into ephemeral snapshots.
 * Describes situation only; never filters eligibility or applies business decisions.
 */
export class ContextEngine implements ContextReaderPort {
  constructor(
    private readonly inputs: ContextInputsPort,
    private readonly enabled: () => boolean = () => isContextEngineEnabled(),
  ) {}

  getSnapshot(userId: string, now: Date): ContextSnapshot | undefined {
    if (!this.enabled()) return undefined;
    const raw = this.inputs.getRawHints(userId, now);
    if (!raw) return undefined;
    const snap = normalizeContext(raw, now);
    return usableContext(snap, now);
  }

  /** Force-build from explicit hints (tests / adapters). Respects enable flag unless bypass. */
  fromHints(hints: ContextRawHints, now: Date, opts?: { bypassFlag?: boolean }): ContextSnapshot | undefined {
    if (!opts?.bypassFlag && !this.enabled()) return undefined;
    return usableContext(normalizeContext(hints, now), now);
  }
}

/** In-memory raw hint store — Nest / tests. No coordinates. */
export class MemoryContextInputStore implements ContextInputsPort {
  private byUser = new Map<string, ContextRawHints>();

  upsert(hints: ContextRawHints): void {
    const prev = this.byUser.get(hints.userId);
    this.byUser.set(hints.userId, { ...prev, ...hints, userId: hints.userId });
  }

  clear(userId?: string): void {
    if (userId) this.byUser.delete(userId);
    else this.byUser.clear();
  }

  getRawHints(userId: string, _now: Date): ContextRawHints | undefined {
    return this.byUser.get(userId);
  }
}

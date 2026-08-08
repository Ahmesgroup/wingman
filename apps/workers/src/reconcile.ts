import type { WingmanEngine } from "@wingman/domain";

/**
 * Expiration reconciler. Correctness must NOT depend on firing at the exact second:
 * every read path and this worker both honor absolute expiresAt.
 */
export function runReconcilePass(engine: WingmanEngine): {
  presence: string[];
  signals: string[];
  connections: string[];
  at: string;
} {
  const result = engine.reconcile();
  return { ...result, at: engine.clock.now().toISOString() };
}

export function startReconcileLoop(engine: WingmanEngine, intervalMs = 5_000): NodeJS.Timeout {
  return setInterval(() => {
    const r = runReconcilePass(engine);
    if (r.presence.length || r.signals.length || r.connections.length) {
      console.log("[worker] reconcile", JSON.stringify(r));
    }
  }, intervalMs);
}

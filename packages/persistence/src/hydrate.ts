import { TERMINAL_CONNECTION_STATES, type WingmanEngine } from "@wingman/domain";
import type { ProtocolHydrationSnapshot, ProtocolRepository } from "./protocol-repository.js";

export type HydrationReport = {
  users: number;
  signalsLoaded: number;
  signalsRestored: number;
  connectionsLoaded: number;
  connectionsRestored: number;
  blocks: number;
  reports: number;
  consents: number;
  locks: number;
  presenceRestored: number;
  reconciled: { presence: string[]; signals: string[]; connections: string[] };
};

function rebuildLocks(engine: WingmanEngine): void {
  engine.locks.clear();
  for (const c of engine.connections.values()) {
    if (c.isActive && !TERMINAL_CONNECTION_STATES.has(c.state)) {
      engine.locks.add(c.initiatorId);
      engine.locks.add(c.recipientId);
    }
  }
}

/**
 * Deterministic boot hydration.
 *
 * Restores durable protocol objects, then runs domain reconcile under server time.
 * Never restores presence/locations/sockets — Redis / client re-activation only.
 */
export function applyHydrationSnapshot(
  engine: WingmanEngine,
  snapshot: ProtocolHydrationSnapshot,
): HydrationReport {
  // Boot starts from durable snapshot only — wipe process-local protocol maps first.
  engine.users.clear();
  engine.signals.clear();
  engine.connections.clear();
  engine.locks.clear();
  engine.signalUsage.clear();
  engine.blocks = [];
  engine.reports = [];
  engine.consents = [];
  engine.presence.clear();
  engine.locations.clear();

  for (const user of snapshot.users) {
    engine.seedUser(user);
  }

  engine.blocks = snapshot.blocks.map((b) => structuredClone(b));
  engine.reports = snapshot.reports.map((r) => structuredClone(r));
  engine.consents = snapshot.consents.map((c) => structuredClone(c));

  for (const { usageKey, count } of snapshot.signalUsage) {
    engine.signalUsage.set(usageKey, count);
  }

  for (const signal of snapshot.signals) {
    engine.signals.set(signal.id, structuredClone(signal));
  }

  for (const connection of snapshot.connections) {
    engine.connections.set(connection.id, structuredClone(connection));
  }

  rebuildLocks(engine);
  const reconciled = engine.reconcile();
  rebuildLocks(engine);

  return {
    users: snapshot.users.length,
    signalsLoaded: snapshot.signals.length,
    signalsRestored: engine.signals.size,
    connectionsLoaded: snapshot.connections.length,
    connectionsRestored: engine.connections.size,
    blocks: snapshot.blocks.length,
    reports: snapshot.reports.length,
    consents: snapshot.consents.length,
    locks: engine.locks.size,
    presenceRestored: 0,
    reconciled,
  };
}

export async function hydrateFromRepository(
  engine: WingmanEngine,
  repo: ProtocolRepository,
): Promise<HydrationReport> {
  const snapshot = await repo.loadForHydration(engine.clock.now());
  return applyHydrationSnapshot(engine, snapshot);
}

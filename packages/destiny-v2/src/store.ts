import type { DestinyProposal, DestinyProposalStatus } from "./types.js";

/**
 * Multi-instance proposal persistence (S24.1).
 * Implementations may be process-local (memory) or Redis-backed.
 */
export interface DestinyProposalStore {
  get(id: string): Promise<DestinyProposal | undefined>;
  getActiveByPair(pairKey: string): Promise<DestinyProposal | undefined>;
  listByUser(userId: string): Promise<DestinyProposal[]>;
  listActiveByUser(userId: string): Promise<DestinyProposal[]>;
  upsert(p: DestinyProposal): Promise<void>;
  listAll(): Promise<DestinyProposal[]>;
}

export class MemoryDestinyProposalStore implements DestinyProposalStore {
  private byId = new Map<string, DestinyProposal>();

  async get(id: string): Promise<DestinyProposal | undefined> {
    return this.byId.get(id);
  }

  async getActiveByPair(pairKey: string): Promise<DestinyProposal | undefined> {
    for (const p of this.byId.values()) {
      if (p.pairKey === pairKey && isOpenStatus(p.status)) return p;
    }
    return undefined;
  }

  async listByUser(userId: string): Promise<DestinyProposal[]> {
    return [...this.byId.values()].filter((p) => p.userA === userId || p.userB === userId);
  }

  async listActiveByUser(userId: string): Promise<DestinyProposal[]> {
    return (await this.listByUser(userId)).filter((p) => isOpenStatus(p.status));
  }

  async upsert(p: DestinyProposal): Promise<void> {
    this.byId.set(p.id, {
      ...p,
      acceptedBy: new Set(p.acceptedBy),
    });
  }

  async listAll(): Promise<DestinyProposal[]> {
    return [...this.byId.values()].map((p) => ({ ...p, acceptedBy: new Set(p.acceptedBy) }));
  }
}

export function isOpenStatus(status: DestinyProposalStatus): boolean {
  return status === "PROPOSED" || status === "A_ACCEPTED" || status === "B_ACCEPTED";
}

export interface DestinyCooldownLedger {
  lastUserProposalAt: Map<string, number>;
  lastPairProposalAt: Map<string, number>;
  lastPairRejectionAt: Map<string, number>;
}

export function createCooldownLedger(): DestinyCooldownLedger {
  return {
    lastUserProposalAt: new Map(),
    lastPairProposalAt: new Map(),
    lastPairRejectionAt: new Map(),
  };
}

/** JSON wire format for Redis (Set → array, Date → ISO). */
export interface DestinyProposalWire {
  id: string;
  pairKey: string;
  userA: string;
  userB: string;
  status: DestinyProposalStatus;
  createdAt: string;
  expiresAt: string;
  acceptedBy: string[];
  score: number;
  reasons: DestinyProposal["reasons"];
  connectionId?: string;
  signalId?: string;
}

export function proposalToWire(p: DestinyProposal): DestinyProposalWire {
  return {
    id: p.id,
    pairKey: p.pairKey,
    userA: p.userA,
    userB: p.userB,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    expiresAt: p.expiresAt.toISOString(),
    acceptedBy: [...p.acceptedBy],
    score: p.score,
    reasons: p.reasons,
    connectionId: p.connectionId,
    signalId: p.signalId,
  };
}

export function proposalFromWire(w: DestinyProposalWire): DestinyProposal {
  return {
    id: w.id,
    pairKey: w.pairKey,
    userA: w.userA,
    userB: w.userB,
    status: w.status,
    createdAt: new Date(w.createdAt),
    expiresAt: new Date(w.expiresAt),
    acceptedBy: new Set(w.acceptedBy),
    score: w.score,
    reasons: w.reasons,
    connectionId: w.connectionId,
    signalId: w.signalId,
  };
}

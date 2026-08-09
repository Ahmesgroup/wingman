import type { DestinyProposal, DestinyProposalStatus } from "./types.js";

export interface DestinyProposalStore {
  get(id: string): DestinyProposal | undefined;
  getActiveByPair(pairKey: string): DestinyProposal | undefined;
  listByUser(userId: string): DestinyProposal[];
  listActiveByUser(userId: string): DestinyProposal[];
  upsert(p: DestinyProposal): void;
  listAll(): DestinyProposal[];
}

export class MemoryDestinyProposalStore implements DestinyProposalStore {
  private byId = new Map<string, DestinyProposal>();

  get(id: string): DestinyProposal | undefined {
    return this.byId.get(id);
  }

  getActiveByPair(pairKey: string): DestinyProposal | undefined {
    for (const p of this.byId.values()) {
      if (p.pairKey === pairKey && isOpenStatus(p.status)) return p;
    }
    return undefined;
  }

  listByUser(userId: string): DestinyProposal[] {
    return [...this.byId.values()].filter((p) => p.userA === userId || p.userB === userId);
  }

  listActiveByUser(userId: string): DestinyProposal[] {
    return this.listByUser(userId).filter((p) => isOpenStatus(p.status));
  }

  upsert(p: DestinyProposal): void {
    this.byId.set(p.id, {
      ...p,
      acceptedBy: new Set(p.acceptedBy),
    });
  }

  listAll(): DestinyProposal[] {
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

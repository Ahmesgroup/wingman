import { randomUUID } from "node:crypto";
import { applyDestinyPolicy } from "./policy.js";
import { evaluateDestinyCandidate } from "./candidate.js";
import type { DestinyCooldownLedger, DestinyProposalStore } from "./store.js";
import { isOpenStatus } from "./store.js";
import type {
  DestinyCandidateResult,
  DestinyPairInput,
  DestinyPolicyConfig,
  DestinyProposal,
  DestinyProposalPublic,
  DestinyProposalStatus,
} from "./types.js";
import {
  DEFAULT_DESTINY_POLICY,
  DESTINY_V2_ENGINE,
  DESTINY_V2_VERSION,
  pairKey,
  toPublicProposal,
} from "./types.js";

export type ConsentResult =
  | { ok: true; proposal: DestinyProposal; becameMutual: boolean }
  | { ok: false; error: string };

export interface EvaluateOptions {
  proposalsEnabled: boolean;
  policy?: DestinyPolicyConfig;
}

export interface EvaluateOutcome {
  candidate: DestinyCandidateResult;
  proposal?: DestinyProposal;
  publicProposal?: DestinyProposalPublic;
  shadow: boolean;
  audit: {
    engine: typeof DESTINY_V2_ENGINE;
    version: typeof DESTINY_V2_VERSION;
    decisionId: string;
    at: string;
  };
}

function expireIfNeeded(p: DestinyProposal, now: Date): DestinyProposal {
  if (isOpenStatus(p.status) && now.getTime() >= p.expiresAt.getTime()) {
    return { ...p, status: "EXPIRED", acceptedBy: new Set(p.acceptedBy) };
  }
  return p;
}

/**
 * Destiny V2 facade — candidate + policy + consent.
 * Never creates connections itself; caller hands MUTUAL to V1 Signal/Connection services.
 * Store I/O is async so Redis and memory backends share one API (S24.1).
 */
export class DestinyV2Engine {
  constructor(
    private readonly store: DestinyProposalStore,
    private readonly cooldowns: DestinyCooldownLedger,
    private readonly policy: DestinyPolicyConfig = DEFAULT_DESTINY_POLICY,
  ) {}

  async evaluate(input: DestinyPairInput, opts: EvaluateOptions): Promise<EvaluateOutcome> {
    const now = input.now;
    for (const p of await this.store.listByUser(input.userA)) {
      const next = expireIfNeeded(p, now);
      if (next.status !== p.status) await this.store.upsert(next);
    }

    const raw = evaluateDestinyCandidate(input);
    const gates = {
      userOnCooldown:
        this.isUserCooling(input.userA, now) || this.isUserCooling(input.userB, now),
      pairOnCooldown: this.isPairCooling(raw.pairKey, now),
      rejectionOnCooldown: this.isRejectionCooling(raw.pairKey, now),
      hasActiveProposal:
        Boolean(await this.store.getActiveByPair(raw.pairKey)) ||
        (await this.store.listActiveByUser(input.userA)).length >= this.policy.maxSimultaneousProposalsPerUser ||
        (await this.store.listActiveByUser(input.userB)).length >= this.policy.maxSimultaneousProposalsPerUser,
    };

    const candidate = applyDestinyPolicy(raw, gates, now, opts.policy ?? this.policy);
    const audit: EvaluateOutcome["audit"] = {
      engine: DESTINY_V2_ENGINE,
      version: DESTINY_V2_VERSION,
      decisionId: randomUUID(),
      at: now.toISOString(),
    };

    if (candidate.decision !== "CANDIDATE") {
      return { candidate, shadow: !opts.proposalsEnabled, audit };
    }

    if (!opts.proposalsEnabled) {
      return { candidate, shadow: true, audit };
    }

    const proposal = this.createProposal(candidate, now);
    await this.store.upsert(proposal);
    this.cooldowns.lastUserProposalAt.set(input.userA, now.getTime());
    this.cooldowns.lastUserProposalAt.set(input.userB, now.getTime());
    this.cooldowns.lastPairProposalAt.set(candidate.pairKey, now.getTime());

    return {
      candidate,
      proposal,
      publicProposal: toPublicProposal(proposal),
      shadow: false,
      audit,
    };
  }

  private createProposal(candidate: DestinyCandidateResult, now: Date): DestinyProposal {
    const [userA, userB] = candidate.pair;
    return {
      id: `dpy_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      pairKey: candidate.pairKey,
      userA,
      userB,
      status: "PROPOSED",
      createdAt: now,
      expiresAt: new Date(candidate.expiresAt ?? now.getTime() + this.policy.proposalTtlMs),
      acceptedBy: new Set(),
      score: candidate.score,
      reasons: candidate.reasons,
    };
  }

  async getPublicProposal(id: string, userId: string, now: Date): Promise<DestinyProposalPublic | undefined> {
    let p = await this.store.get(id);
    if (!p) return undefined;
    if (p.userA !== userId && p.userB !== userId) return undefined;
    p = expireIfNeeded(p, now);
    if (p.status === "EXPIRED") await this.store.upsert(p);
    return toPublicProposal(p);
  }

  async listPublicForUser(userId: string, now: Date): Promise<DestinyProposalPublic[]> {
    const listed = await this.store.listByUser(userId);
    const nexts: DestinyProposal[] = [];
    for (const p of listed) {
      const next = expireIfNeeded(p, now);
      if (next.status !== p.status) await this.store.upsert(next);
      nexts.push(next);
    }
    return nexts
      .filter((p) => isOpenStatus(p.status) || p.status === "MUTUAL")
      .map(toPublicProposal);
  }

  /**
   * Atomic consent against the shared store. Concurrent accepts converge to a single MUTUAL.
   */
  async accept(proposalId: string, userId: string, now: Date): Promise<ConsentResult> {
    let p = await this.store.get(proposalId);
    if (!p) return { ok: false, error: "not_found" };
    p = expireIfNeeded(p, now);
    if (p.status === "EXPIRED") {
      await this.store.upsert(p);
      return { ok: false, error: "expired" };
    }
    if (p.status === "DECLINED" || p.status === "INVALIDATED") {
      return { ok: false, error: "not_accepting" };
    }
    if (p.status === "MUTUAL") {
      return { ok: true, proposal: p, becameMutual: false };
    }
    if (userId !== p.userA && userId !== p.userB) {
      return { ok: false, error: "forbidden" };
    }

    const acceptedBy = new Set(p.acceptedBy);
    acceptedBy.add(userId);
    const both = acceptedBy.has(p.userA) && acceptedBy.has(p.userB);

    let status: DestinyProposalStatus = p.status;
    if (both) {
      status = "MUTUAL";
    } else if (userId === p.userA) {
      status = "A_ACCEPTED";
    } else {
      status = "B_ACCEPTED";
    }

    const next: DestinyProposal = { ...p, status, acceptedBy };
    await this.store.upsert(next);
    return { ok: true, proposal: next, becameMutual: both };
  }

  async decline(proposalId: string, userId: string, now: Date): Promise<ConsentResult> {
    let p = await this.store.get(proposalId);
    if (!p) return { ok: false, error: "not_found" };
    p = expireIfNeeded(p, now);
    if (p.status === "EXPIRED") {
      await this.store.upsert(p);
      return { ok: false, error: "expired" };
    }
    if (p.status === "MUTUAL") return { ok: false, error: "already_mutual" };
    if (userId !== p.userA && userId !== p.userB) return { ok: false, error: "forbidden" };
    if (!isOpenStatus(p.status)) return { ok: false, error: "not_open" };

    const next: DestinyProposal = { ...p, status: "DECLINED", acceptedBy: new Set(p.acceptedBy) };
    await this.store.upsert(next);
    this.cooldowns.lastPairRejectionAt.set(p.pairKey, now.getTime());
    return { ok: true, proposal: next, becameMutual: false };
  }

  async invalidatePair(pairKeyStr: string, now: Date): Promise<void> {
    void now;
    for (const p of await this.store.listAll()) {
      if (p.pairKey === pairKeyStr && isOpenStatus(p.status)) {
        await this.store.upsert({ ...p, status: "INVALIDATED", acceptedBy: new Set(p.acceptedBy) });
      }
    }
  }

  async attachConnection(proposalId: string, signalId: string, connectionId: string): Promise<void> {
    const p = await this.store.get(proposalId);
    if (!p) return;
    await this.store.upsert({ ...p, signalId, connectionId, acceptedBy: new Set(p.acceptedBy) });
  }

  async getProposal(proposalId: string): Promise<DestinyProposal | undefined> {
    return this.store.get(proposalId);
  }

  private isUserCooling(userId: string, now: Date): boolean {
    const t = this.cooldowns.lastUserProposalAt.get(userId);
    return t !== undefined && now.getTime() - t < this.policy.userCooldownMs;
  }

  private isPairCooling(key: string, now: Date): boolean {
    const t = this.cooldowns.lastPairProposalAt.get(key);
    return t !== undefined && now.getTime() - t < this.policy.pairCooldownMs;
  }

  private isRejectionCooling(key: string, now: Date): boolean {
    const t = this.cooldowns.lastPairRejectionAt.get(key);
    return t !== undefined && now.getTime() - t < this.policy.rejectionCooldownMs;
  }
}

export { pairKey };

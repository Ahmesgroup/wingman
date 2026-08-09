import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Optional,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import type { WingmanEngine } from "@wingman/domain";
import { distanceMeters } from "@wingman/domain";
import type { EphemeralStore } from "@wingman/ephemeral";
import {
  DestinyV2Engine,
  isDestinyV2Enabled,
  isDestinyV2ProposalsEnabled,
  pairKey,
  type DestinyContextPort,
  type DestinyProposalPublic,
} from "@wingman/destiny-v2";
import type { RadarContextPort } from "@wingman/radar-intelligence";
import { CurrentUser } from "../../common/auth.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE } from "../infra/infra.tokens.js";
import { RADAR_CONTEXT_PORT } from "../context/context.tokens.js";
import { SignalsService } from "../signals/signals.controller.js";
import { DESTINY_V2_ENGINE } from "./destiny.tokens.js";

function asDestinyContextPort(port?: RadarContextPort): DestinyContextPort | undefined {
  if (!port) return undefined;
  return {
    forUser(userId, now) {
      return port.forUser(userId, now);
    },
  };
}

@Injectable()
export class DestinyService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(EPHEMERAL_STORE) private readonly ephemeral: EphemeralStore,
    private readonly signals: SignalsService,
    @Optional() @Inject(DESTINY_V2_ENGINE) private readonly destinyV2?: DestinyV2Engine,
    @Optional() @Inject(RADAR_CONTEXT_PORT) private readonly radarContext?: RadarContextPort,
  ) {}

  /** V1 eligibility: mutual interest + both radar-visible + not blocked (via getCandidates). */
  private v1PairEligible(a: string, b: string): boolean {
    try {
      const aSees = this.engine.getCandidates(a).some((c) => c.userId === b);
      const bSees = this.engine.getCandidates(b).some((c) => c.userId === a);
      return aSees && bSees;
    } catch {
      return false;
    }
  }

  private distanceBand(a: string, b: string): "NEAR" | "AROUND" | undefined {
    const la = this.engine.locations.get(a);
    const lb = this.engine.locations.get(b);
    if (!la || !lb) return undefined;
    const d = distanceMeters(la, lb);
    return d <= 50 ? "NEAR" : d <= 200 ? "AROUND" : undefined;
  }

  private recentInteraction(a: string, b: string): boolean {
    return [...this.engine.signals.values()].some(
      (s) =>
        (s.senderId === a && s.receiverId === b) || (s.senderId === b && s.receiverId === a),
    );
  }

  copresence(userId: string, otherUserId: string) {
    // Always record copresence fact in V1 store (DPIA / hydrate)
    const copresence = this.engine.noteCopresence(userId, otherUserId);

    if (!isDestinyV2Enabled() || !this.destinyV2) {
      const emitted = this.engine.tryDestinyPrompt(userId, otherUserId);
      return { copresence, promptEmitted: emitted };
    }

    const now = this.engine.clock.now();
    const proposalsEnabled = isDestinyV2ProposalsEnabled();
    const outcome = this.destinyV2.evaluate(
      {
        userA: userId,
        userB: otherUserId,
        v1Eligible: this.v1PairEligible(userId, otherUserId),
        distanceBand: this.distanceBand(userId, otherUserId),
        recentInteraction: this.recentInteraction(userId, otherUserId),
        recentExposureCount: 0,
        now,
        contextPort: asDestinyContextPort(this.radarContext),
      },
      { proposalsEnabled },
    );

    if (!proposalsEnabled) {
      return {
        copresence,
        promptEmitted: false,
        shadow: true,
        // audit id only — never score/reasons in public body
        shadowDecisionId: outcome.audit.decisionId,
      };
    }

    return {
      copresence,
      promptEmitted: Boolean(outcome.publicProposal),
      proposal: outcome.publicProposal,
    };
  }

  listProposals(userId: string): { proposals: DestinyProposalPublic[] } {
    if (!isDestinyV2Enabled() || !isDestinyV2ProposalsEnabled() || !this.destinyV2) {
      return { proposals: [] };
    }
    return { proposals: this.destinyV2.listPublicForUser(userId, this.engine.clock.now()) };
  }

  async acceptProposal(userId: string, proposalId: string) {
    if (!isDestinyV2Enabled() || !isDestinyV2ProposalsEnabled() || !this.destinyV2) {
      throw new UnauthorizedException({ error: { code: "DESTINY_V2_OFF", message: "Destiny V2 proposals disabled" } });
    }
    const now = this.engine.clock.now();
    const lockKey = `destiny-accept:${proposalId}`;
    const owner = `api:${process.pid}:${userId}`;
    const got = await this.ephemeral.acquireLock(lockKey, owner, 15);
    try {
      const result = this.destinyV2.accept(proposalId, userId, now);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const publicView = {
        proposalId: result.proposal.id,
        status: result.proposal.status,
        message: "Une convergence inhabituelle vient d'être détectée.",
        expiresAt: result.proposal.expiresAt.toISOString(),
      };

      if (!result.becameMutual) {
        return { ok: true, proposal: publicView, connection: null };
      }

      // Handoff to existing V1 Signal → Connection path (no parallel protocol)
      const initiator = result.proposal.userA;
      const recipient = result.proposal.userB;
      const { signal } = await this.signals.create(
        initiator,
        { receiverId: recipient, source: "DESTINY" },
        `destiny:${result.proposal.id}`,
      );
      await this.signals.open(signal.id, recipient);
      const connection = await this.signals.accept(signal.id, recipient);
      this.destinyV2.attachConnection(result.proposal.id, signal.id, connection.id);
      return {
        ok: true,
        proposal: { ...publicView, status: "MUTUAL" as const },
        connection: { id: connection.id, state: connection.state },
      };
    } finally {
      if (got) await this.ephemeral.releaseLock(lockKey, owner);
    }
  }

  declineProposal(userId: string, proposalId: string) {
    if (!isDestinyV2Enabled() || !isDestinyV2ProposalsEnabled() || !this.destinyV2) {
      throw new UnauthorizedException({ error: { code: "DESTINY_V2_OFF", message: "Destiny V2 proposals disabled" } });
    }
    const result = this.destinyV2.decline(proposalId, userId, this.engine.clock.now());
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      proposal: {
        proposalId: result.proposal.id,
        status: result.proposal.status,
        message: "Une convergence inhabituelle vient d'être détectée.",
        expiresAt: result.proposal.expiresAt.toISOString(),
      },
    };
  }

  invalidateForBlock(blockerId: string, blockedId: string): void {
    if (!this.destinyV2) return;
    this.destinyV2.invalidatePair(pairKey(blockerId, blockedId), this.engine.clock.now());
  }
}

@Controller("destiny")
export class DestinyController {
  constructor(private readonly destiny: DestinyService) {}

  @Post("copresence")
  copresence(@CurrentUser() userId: string, @Body() body: { otherUserId: string }) {
    return this.destiny.copresence(userId, body.otherUserId);
  }

  @Get("proposals")
  proposals(@CurrentUser() userId: string) {
    return this.destiny.listProposals(userId);
  }

  @Post("proposals/:id/accept")
  accept(@CurrentUser() userId: string, @Param("id") id: string) {
    return this.destiny.acceptProposal(userId, id);
  }

  @Post("proposals/:id/decline")
  decline(@CurrentUser() userId: string, @Param("id") id: string) {
    return this.destiny.declineProposal(userId, id);
  }
}

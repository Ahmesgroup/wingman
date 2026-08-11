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
import {
  GeoIntelligenceEngine,
  isGeoIntelligenceEnabled,
} from "@wingman/geo-intelligence";
import { CurrentUser } from "../../common/auth.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE } from "../infra/infra.tokens.js";
import { RADAR_CONTEXT_PORT } from "../context/context.tokens.js";
import { SignalsService } from "../signals/signals.controller.js";
import { AntiAbuseGate } from "../anti-abuse/anti-abuse.module.js";
import { GEO_ENGINE } from "../geo/geo.tokens.js";
import { MeasurementGate } from "../measurement/measurement.module.js";
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
    @Optional() private readonly antiAbuse?: AntiAbuseGate,
    @Optional() @Inject(GEO_ENGINE) private readonly geo?: GeoIntelligenceEngine,
    @Optional() private readonly measurement?: MeasurementGate,
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

  private distanceBand(a: string, b: string): {
    band: "NEAR" | "AROUND" | undefined;
    geoFallback: boolean;
  } {
    if (isGeoIntelligenceEnabled() && this.geo) {
      const pair = this.geo.forPair(a, b, this.engine.clock.now());
      if (pair?.distanceBand === "NEAR" || pair?.distanceBand === "AROUND") {
        return { band: pair.distanceBand, geoFallback: false };
      }
      // Geo FAR / missing → fall through to V1 haversine for Destiny candidate scoring only
      const la = this.engine.locations.get(a);
      const lb = this.engine.locations.get(b);
      if (!la || !lb) return { band: undefined, geoFallback: true };
      const d = distanceMeters(la, lb);
      return { band: d <= 50 ? "NEAR" : d <= 200 ? "AROUND" : undefined, geoFallback: true };
    }
    const la = this.engine.locations.get(a);
    const lb = this.engine.locations.get(b);
    if (!la || !lb) return { band: undefined, geoFallback: true };
    const d = distanceMeters(la, lb);
    return { band: d <= 50 ? "NEAR" : d <= 200 ? "AROUND" : undefined, geoFallback: true };
  }

  private recentInteraction(a: string, b: string): boolean {
    return [...this.engine.signals.values()].some(
      (s) =>
        (s.senderId === a && s.receiverId === b) || (s.senderId === b && s.receiverId === a),
    );
  }

  async copresence(userId: string, otherUserId: string) {
    this.antiAbuse?.assertAllowed(userId, "DESTINY_ACTION");
    // Always record copresence fact in V1 store (DPIA / hydrate)
    const copresence = this.engine.noteCopresence(userId, otherUserId);
    this.antiAbuse?.note("destiny.copresence", userId, {
      subjectId: otherUserId,
      evaluate: true,
    });

    if (!isDestinyV2Enabled() || !this.destinyV2) {
      const emitted = this.engine.tryDestinyPrompt(userId, otherUserId);
      return { copresence, promptEmitted: emitted };
    }

    const now = this.engine.clock.now();
    const proposalsEnabled = isDestinyV2ProposalsEnabled();
    const dist = this.distanceBand(userId, otherUserId);
    const contextPort = asDestinyContextPort(this.radarContext);
    const missingContext =
      !contextPort?.forUser(userId, now) || !contextPort?.forUser(otherUserId, now);
    const outcome = await this.destinyV2.evaluate(
      {
        userA: userId,
        userB: otherUserId,
        v1Eligible: this.v1PairEligible(userId, otherUserId),
        distanceBand: dist.band,
        recentInteraction: this.recentInteraction(userId, otherUserId),
        recentExposureCount: 0,
        now,
        contextPort,
      },
      { proposalsEnabled },
    );

    const reasons = outcome.candidate.reasons.slice(0, 8);
    if (missingContext && !reasons.includes("missing_context_neutral")) {
      reasons.push("missing_context_neutral");
    }

    if (!proposalsEnabled) {
      this.measurement?.noteDecision("DESTINY_V2", outcome.audit.version, "destiny_evaluate", {
        actorId: userId,
        reasons,
        meta: {
          shadow: true,
          decision: outcome.candidate.decision,
          geoFallback: dist.geoFallback,
          missingContext,
        },
      });
      if (missingContext) this.measurement?.noteOutcome("context.fallback", { meta: { source: "destiny" } });
      if (dist.geoFallback) this.measurement?.noteOutcome("geo.fallback", { meta: { source: "destiny" } });
      return {
        copresence,
        promptEmitted: false,
        shadow: true,
        // audit id only — never score/reasons in public body
        shadowDecisionId: outcome.audit.decisionId,
      };
    }

    if (outcome.publicProposal) {
      this.measurement?.noteDecision("DESTINY_V2", outcome.audit.version, "destiny_evaluate", {
        actorId: userId,
        reasons,
        meta: {
          decision: outcome.candidate.decision,
          geoFallback: dist.geoFallback,
          missingContext,
        },
      });
      this.measurement?.noteOutcome("destiny.proposed");
      if (missingContext) this.measurement?.noteOutcome("context.fallback", { meta: { source: "destiny" } });
      if (dist.geoFallback) this.measurement?.noteOutcome("geo.fallback", { meta: { source: "destiny" } });
    }

    return {
      copresence,
      promptEmitted: Boolean(outcome.publicProposal),
      proposal: outcome.publicProposal,
    };
  }

  async listProposals(userId: string): Promise<{ proposals: DestinyProposalPublic[] }> {
    if (!isDestinyV2Enabled() || !isDestinyV2ProposalsEnabled() || !this.destinyV2) {
      return { proposals: [] };
    }
    return { proposals: await this.destinyV2.listPublicForUser(userId, this.engine.clock.now()) };
  }

  async acceptProposal(userId: string, proposalId: string) {
    if (!isDestinyV2Enabled() || !isDestinyV2ProposalsEnabled() || !this.destinyV2) {
      throw new UnauthorizedException({ error: { code: "DESTINY_V2_OFF", message: "Destiny V2 proposals disabled" } });
    }
    this.antiAbuse?.assertAllowed(userId, "DESTINY_ACTION");
    const now = this.engine.clock.now();
    const lockKey = `destiny-accept:${proposalId}`;
    const owner = `api:${process.pid}:${userId}`;
    const got = await this.ephemeral.acquireLock(lockKey, owner, 15);
    try {
      const result = await this.destinyV2.accept(proposalId, userId, now);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      this.antiAbuse?.note("destiny.accept", userId, {
        eventId: `destiny-accept:${proposalId}:${userId}`,
        evaluate: true,
      });
      const publicView = {
        proposalId: result.proposal.id,
        status: result.proposal.status,
        message: "Une convergence inhabituelle vient d'être détectée.",
        expiresAt: result.proposal.expiresAt.toISOString(),
      };

      if (!result.becameMutual && result.proposal.status !== "MUTUAL") {
        this.measurement?.noteDecision("DESTINY_V2", "1.1.0", "destiny_accept", { actorId: userId });
        this.measurement?.noteOutcome("destiny.accept", {
          meta: { status: result.proposal.status },
        });
        return { ok: true, proposal: publicView, connection: null };
      }

      // Shared store may already have connection from peer handoff (S24.1)
      let latest = (await this.destinyV2.getProposal(proposalId)) ?? result.proposal;
      if (latest.connectionId) {
        const existing = this.engine.connections.get(latest.connectionId);
        return {
          ok: true,
          proposal: { ...publicView, status: "MUTUAL" as const },
          connection: existing
            ? { id: existing.id, state: existing.state }
            : { id: latest.connectionId, state: "WAITING_FOR_INITIATOR_SELFIE" },
        };
      }

      // Only lock holder creates V1 Signal→Connection (prevents double handoff)
      if (!got) {
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 25));
          latest = (await this.destinyV2.getProposal(proposalId)) ?? latest;
          if (latest.connectionId) {
            const existing = this.engine.connections.get(latest.connectionId);
            return {
              ok: true,
              proposal: { ...publicView, status: "MUTUAL" as const },
              connection: existing
                ? { id: existing.id, state: existing.state }
                : { id: latest.connectionId, state: "WAITING_FOR_INITIATOR_SELFIE" },
            };
          }
        }
        return { ok: true, proposal: { ...publicView, status: "MUTUAL" as const }, connection: null };
      }

      this.measurement?.noteDecision("DESTINY_V2", "1.1.0", "destiny_mutual", { actorId: userId });
      this.measurement?.noteOutcome("destiny.mutual");

      const initiator = latest.userA;
      const recipient = latest.userB;
      const { signal } = await this.signals.create(
        initiator,
        { receiverId: recipient, source: "DESTINY" },
        `destiny:${latest.id}`,
      );
      await this.signals.open(signal.id, recipient);
      const connection = await this.signals.accept(signal.id, recipient);
      await this.destinyV2.attachConnection(latest.id, signal.id, connection.id);
      return {
        ok: true,
        proposal: { ...publicView, status: "MUTUAL" as const },
        connection: { id: connection.id, state: connection.state },
      };
    } finally {
      if (got) await this.ephemeral.releaseLock(lockKey, owner);
    }
  }

  async declineProposal(userId: string, proposalId: string) {
    if (!isDestinyV2Enabled() || !isDestinyV2ProposalsEnabled() || !this.destinyV2) {
      throw new UnauthorizedException({ error: { code: "DESTINY_V2_OFF", message: "Destiny V2 proposals disabled" } });
    }
    this.antiAbuse?.assertAllowed(userId, "DESTINY_ACTION");
    const result = await this.destinyV2.decline(proposalId, userId, this.engine.clock.now());
    if (!result.ok) return { ok: false, error: result.error };
    this.antiAbuse?.note("destiny.decline", userId, {
      eventId: `destiny-decline:${proposalId}:${userId}`,
      evaluate: true,
    });
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

  async invalidateForBlock(blockerId: string, blockedId: string): Promise<void> {
    if (!this.destinyV2) return;
    await this.destinyV2.invalidatePair(pairKey(blockerId, blockedId), this.engine.clock.now());
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

import { Body, Controller, Get, Inject, Injectable, Optional, Post, Query } from "@nestjs/common";
import { ActivateRadarSchema, HeartbeatSchema } from "@wingman/contracts";
import type { PresenceVisibility, WingmanEngine } from "@wingman/domain";
import type { EphemeralStore } from "@wingman/ephemeral";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import {
  ExposureStore,
  isRadarIntelligenceEnabled,
  rankRadarCandidates,
  toPublicCandidateView,
  type EligibleCandidate,
  type RankingAuditRecord,
} from "@wingman/radar-intelligence";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "../realtime/realtime-app.service.js";
import { RADAR_EXPOSURE_STORE, RADAR_LANGUAGE_HINTS } from "./radar.tokens.js";

/** Optional language hints — Context Engine (S22) will own this; not identity. */
export type LanguageHints = Map<string, string[]>;

@Injectable()
export class RadarService {
  private lastAudit: RankingAuditRecord | undefined;

  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(EPHEMERAL_STORE) private readonly ephemeral: EphemeralStore,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
    private readonly realtime: RealtimeAppService,
    @Optional() @Inject(RADAR_EXPOSURE_STORE) private readonly exposure?: ExposureStore,
    @Optional() @Inject(RADAR_LANGUAGE_HINTS) private readonly languageHints?: LanguageHints,
  ) {}

  /** Test/ops: last internal ranking audit (scores never in HTTP body). */
  getLastRankingAudit(): RankingAuditRecord | undefined {
    return this.lastAudit;
  }

  async activate(userId: string, body: { lat: number; lng: number; visibility: string }) {
    const presence = this.engine.activateRadar(
      userId,
      { lat: body.lat, lng: body.lng },
      body.visibility as PresenceVisibility,
    );
    await this.ephemeral.setPresence(
      {
        userId,
        visibility: presence.visibility,
        online: presence.online,
        expiresAtMs: presence.expiresAt.getTime(),
        location: { lat: body.lat, lng: body.lng },
      },
      120,
    );
    await this.mirror.mirrorPresence(userId);
    await this.realtime.noteRadarPresence(userId, body.lat, body.lng, true);
    return presence;
  }

  async deactivate(userId: string) {
    const presence = this.engine.deactivateRadar(userId);
    await this.ephemeral.deletePresence(userId);
    await this.mirror.mirrorPresence(userId);
    const loc = this.engine.locations.get(userId);
    if (loc) await this.realtime.noteRadarPresence(userId, loc.lat, loc.lng, false);
    return presence;
  }

  async heartbeat(userId: string, body: { lat?: number; lng?: number }) {
    const location =
      body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : undefined;
    const presence = this.engine.heartbeat(userId, location);
    await this.ephemeral.heartbeat(userId, 120, location);
    await this.mirror.mirrorPresence(userId);
    const loc = location ?? this.engine.locations.get(userId);
    if (loc) await this.realtime.noteRadarPresence(userId, loc.lat, loc.lng, true);
    return presence;
  }

  candidates(userId: string, near: number, around: number) {
    const now = this.engine.clock.now();
    const v1 = this.engine.getCandidates(userId, near, around);

    if (!isRadarIntelligenceEnabled()) {
      this.lastAudit = undefined;
      return { candidates: v1, serverTime: now.toISOString() };
    }

    const enriched: EligibleCandidate[] = v1.map((c) => {
      const presence = this.engine.presence.get(c.userId);
      const recentInteraction = [...this.engine.signals.values()].some(
        (s) =>
          (s.senderId === userId && s.receiverId === c.userId) ||
          (s.senderId === c.userId && s.receiverId === userId),
      );
      return {
        userId: c.userId,
        approximateDistanceBand: c.approximateDistanceBand,
        mood: c.mood,
        intention: c.intention,
        presenceRemainingMs: presence ? presence.expiresAt.getTime() - now.getTime() : undefined,
        heartbeatAgeMs: presence ? now.getTime() - presence.lastHeartbeatAt.getTime() : undefined,
        languages: this.languageHints?.get(c.userId),
        recentInteraction,
      };
    });

    const exposure = this.exposure;
    const { ordered, audit } = rankRadarCandidates({
      viewerId: userId,
      viewerLanguages: this.languageHints?.get(userId),
      now,
      candidates: enriched,
      recentExposureCount: exposure
        ? (candidateId) => exposure.countRecent(userId, candidateId, now)
        : undefined,
    });

    this.lastAudit = audit;
    exposure?.recordImpressions(
      userId,
      ordered.map((c) => c.userId),
      now,
    );

    return {
      candidates: ordered.map(toPublicCandidateView),
      serverTime: now.toISOString(),
    };
  }
}

@Controller("radar")
export class RadarController {
  constructor(private readonly radar: RadarService) {}

  @Post("activate")
  async activate(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(ActivateRadarSchema))
    body: { lat: number; lng: number; visibility: string },
  ) {
    return { presence: await this.radar.activate(userId, body) };
  }

  @Post("deactivate")
  async deactivate(@CurrentUser() userId: string) {
    return { presence: await this.radar.deactivate(userId) };
  }

  @Post("heartbeat")
  async heartbeat(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(HeartbeatSchema)) body: { lat?: number; lng?: number },
  ) {
    return { presence: await this.radar.heartbeat(userId, body) };
  }

  @Get("candidates")
  candidates(
    @CurrentUser() userId: string,
    @Query("nearRadiusM") near?: string,
    @Query("aroundRadiusM") around?: string,
  ) {
    return this.radar.candidates(userId, Number(near ?? 50), Number(around ?? 200));
  }
}

import { Body, Controller, Get, Inject, Injectable, Optional, Post, Query } from "@nestjs/common";
import { ActivateRadarSchema, HeartbeatSchema } from "@wingman/contracts";
import type { PresenceVisibility, WingmanEngine } from "@wingman/domain";
import type { EphemeralStore } from "@wingman/ephemeral";
import { isContextEngineEnabled } from "@wingman/context-engine";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import {
  ExposureStore,
  isRadarIntelligenceEnabled,
  rankRadarCandidates,
  toPublicCandidateView,
  type EligibleCandidate,
  type RadarContextPort,
  type RankingAuditRecord,
} from "@wingman/radar-intelligence";
import {
  GeoIntelligenceEngine,
  isGeoIntelligenceEnabled,
} from "@wingman/geo-intelligence";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "../realtime/realtime-app.service.js";
import { RADAR_CONTEXT_PORT } from "../context/context.tokens.js";
import { AntiAbuseGate } from "../anti-abuse/anti-abuse.module.js";
import { GEO_ENGINE } from "../geo/geo.tokens.js";
import { RADAR_EXPOSURE_STORE, RADAR_LANGUAGE_HINTS } from "./radar.tokens.js";

/** Legacy S21 language hints when Context Engine flag is off. */
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
    @Optional() @Inject(RADAR_CONTEXT_PORT) private readonly contextPort?: RadarContextPort,
    @Optional() private readonly antiAbuse?: AntiAbuseGate,
    @Optional() @Inject(GEO_ENGINE) private readonly geo?: GeoIntelligenceEngine,
  ) {}

  getLastRankingAudit(): RankingAuditRecord | undefined {
    return this.lastAudit;
  }

  private geoActive(): GeoIntelligenceEngine | undefined {
    if (!isGeoIntelligenceEnabled() || !this.geo) return undefined;
    return this.geo;
  }

  async activate(userId: string, body: { lat: number; lng: number; visibility: string }) {
    const presence = this.engine.activateRadar(
      userId,
      { lat: body.lat, lng: body.lng },
      body.visibility as PresenceVisibility,
    );
    const geo = this.geoActive();
    const now = this.engine.clock.now();
    const ingested = geo?.ingest(userId, body.lat, body.lng, now);
    // Prefer privacy-reduced coords for ephemeral when Geo on
    const ephemeralLoc = ingested?.quantized ?? { lat: body.lat, lng: body.lng };
    await this.ephemeral.setPresence(
      {
        userId,
        visibility: presence.visibility,
        online: presence.online,
        expiresAtMs: presence.expiresAt.getTime(),
        location: ephemeralLoc,
      },
      120,
    );
    await this.mirror.mirrorPresence(userId);
    // Realtime already zones — pass coords for zone derivation only
    await this.realtime.noteRadarPresence(userId, ephemeralLoc.lat, ephemeralLoc.lng, true);
    return presence;
  }

  async deactivate(userId: string) {
    const presence = this.engine.deactivateRadar(userId);
    this.geoActive()?.clear(userId);
    await this.ephemeral.deletePresence(userId);
    await this.mirror.mirrorPresence(userId);
    const loc = this.engine.locations.get(userId);
    if (loc) await this.realtime.noteRadarPresence(userId, loc.lat, loc.lng, false);
    return presence;
  }

  async heartbeat(userId: string, body: { lat?: number; lng?: number }) {
    const prev = this.engine.locations.get(userId);
    const location =
      body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : undefined;
    const presence = this.engine.heartbeat(userId, location);
    const geo = this.geoActive();
    const now = this.engine.clock.now();
    let ephemeralLoc = location;
    let approxDeltaM: number | undefined;
    if (location && geo) {
      const ingested = geo.ingest(userId, location.lat, location.lng, now);
      ephemeralLoc = ingested.quantized;
      approxDeltaM = ingested.approxDeltaM;
    }
    await this.ephemeral.heartbeat(userId, 120, ephemeralLoc);
    await this.mirror.mirrorPresence(userId);
    const loc = ephemeralLoc ?? this.engine.locations.get(userId);
    if (loc) await this.realtime.noteRadarPresence(userId, loc.lat, loc.lng, true);
    if (location && this.antiAbuse) {
      if (approxDeltaM === undefined && prev) {
        const dlat = location.lat - prev.lat;
        const dlng = location.lng - prev.lng;
        approxDeltaM = Math.round(Math.sqrt(dlat * dlat + dlng * dlng) * 111_000);
      }
      if (approxDeltaM !== undefined) {
        this.antiAbuse.note("geo.heartbeat", userId, {
          meta: { approxDistanceDeltaM: approxDeltaM },
          evaluate: true,
        });
      }
    }
    return presence;
  }

  candidates(userId: string, near: number, around: number) {
    this.antiAbuse?.assertAllowed(userId, "RADAR_CANDIDATES");
    this.antiAbuse?.note("radar.candidates", userId, { evaluate: true });

    const now = this.engine.clock.now();
    // V1 eligibility radii unchanged — Geo adaptive recommendations are ranking-only in S25
    const v1 = this.engine.getCandidates(userId, near, around);

    if (!isRadarIntelligenceEnabled()) {
      this.lastAudit = undefined;
      return { candidates: v1, serverTime: now.toISOString() };
    }

    const useContext = isContextEngineEnabled() && this.contextPort;
    const geo = this.geoActive();

    const enriched: EligibleCandidate[] = v1.map((c) => {
      const presence = this.engine.presence.get(c.userId);
      const recentInteraction = [...this.engine.signals.values()].some(
        (s) =>
          (s.senderId === userId && s.receiverId === c.userId) ||
          (s.senderId === c.userId && s.receiverId === userId),
      );
      const pair = geo?.forPair(userId, c.userId, now);
      const base: EligibleCandidate = {
        userId: c.userId,
        approximateDistanceBand: c.approximateDistanceBand,
        mood: c.mood,
        intention: c.intention,
        presenceRemainingMs: presence ? presence.expiresAt.getTime() - now.getTime() : undefined,
        heartbeatAgeMs: presence ? now.getTime() - presence.lastHeartbeatAt.getTime() : undefined,
        recentInteraction,
        geoSameCell: pair?.sameCell,
      };
      if (!useContext) {
        base.languages = this.languageHints?.get(c.userId);
      }
      return base;
    });

    const exposure = this.exposure;
    const { ordered, audit } = rankRadarCandidates({
      viewerId: userId,
      viewerLanguages: useContext ? undefined : this.languageHints?.get(userId),
      now,
      candidates: enriched,
      recentExposureCount: exposure
        ? (candidateId) => exposure.countRecent(userId, candidateId, now)
        : undefined,
      contextPort: useContext ? this.contextPort : undefined,
    });

    this.lastAudit = audit;
    exposure?.recordImpressions(
      userId,
      ordered.map((c) => c.userId),
      now,
    );

    // Public payload: V1 fields only — never raw context snapshot / confidence / score
    return {
      candidates: ordered.map((c) => {
        const pub = toPublicCandidateView(c);
        if (useContext) {
          const snap = this.contextPort!.forUser(c.userId, now);
          return {
            ...pub,
            ...(snap?.mood && !pub.mood ? { mood: snap.mood } : {}),
            ...(snap?.intention && !pub.intention ? { intention: snap.intention } : {}),
          };
        }
        return pub;
      }),
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

import { Body, Controller, Get, Inject, Injectable, Optional, Post, Query } from "@nestjs/common";
import { ActivateRadarSchema, HeartbeatSchema } from "@wingman/contracts";
import { DomainError, distanceMeters, type PresenceVisibility, type WingmanEngine } from "@wingman/domain";
import type { EphemeralStore } from "@wingman/ephemeral";
import { isContextEngineEnabled } from "@wingman/context-engine";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import {
  ExposureStore,
  aggregatePulse,
  boundOpportunities,
  filterOpportunities,
  isLivingMapEnabled,
  isRadarIntelligenceEnabled,
  LIVING_MAP_VERSION,
  parseFilters,
  payloadLeaksCoordinates,
  projectOpportunity,
  quietPulse,
  bearingDegrees,
  rankRadarCandidates,
  toPublicCandidateView,
  type EligibleCandidate,
  type LivingMapFilters,
  type OpportunityPublic,
  type RadarContextPort,
  type RankingAuditRecord,
} from "@wingman/radar-intelligence";
import {
  GeoIntelligenceEngine,
  isGeoIntelligenceEnabled,
  publicViewerPlace,
} from "@wingman/geo-intelligence";
import {
  DestinyV2Engine,
  isDestinyV2Enabled,
  isDestinyV2ProposalsEnabled,
} from "@wingman/destiny-v2";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "../realtime/realtime-app.service.js";
import { RADAR_CONTEXT_PORT } from "../context/context.tokens.js";
import { AntiAbuseGate } from "../anti-abuse/anti-abuse.module.js";
import { GEO_ENGINE } from "../geo/geo.tokens.js";
import { MeasurementGate } from "../measurement/measurement.module.js";
import { DESTINY_V2_ENGINE } from "../destiny/destiny.tokens.js";
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
    @Optional() private readonly measurement?: MeasurementGate,
    @Optional() @Inject(DESTINY_V2_ENGINE) private readonly destinyV2?: DestinyV2Engine,
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
    if (ingested) {
      this.measurement?.noteDecision("GEO_INTELLIGENCE", ingested.audit.version, "geo_ingest", {
        actorId: userId,
        reasons: [ingested.view.freshness, ingested.view.density, ingested.view.movement],
        meta: { density: ingested.view.density, freshness: ingested.view.freshness },
      });
      this.measurement?.noteOutcome("geo.ingested", {
        meta: { density: ingested.view.density },
      });
    }
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
    let repeatCount = 0;
    if (exposure) {
      for (const c of enriched) {
        if (exposure.countRecent(userId, c.userId, now) >= 1) repeatCount += 1;
      }
    }
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

    const reasonSet = new Set<string>();
    for (const d of audit.decisions) for (const r of d.reasons) reasonSet.add(r);
    const missingContext =
      !useContext ||
      !this.contextPort?.forUser(userId, now) ||
      ordered.some((c) => useContext && !this.contextPort?.forUser(c.userId, now));
    if (missingContext) reasonSet.add("missing_context_neutral");

    this.measurement?.markRadarImpression(userId);
    this.measurement?.noteDecision("RADAR_RANKING", audit.version, "rank", {
      actorId: userId,
      reasons: [...reasonSet].slice(0, 12),
      meta: {
        inputCount: audit.inputCount,
        outputCount: ordered.length,
        missingContext,
        repeatCandidates: repeatCount,
      },
    });
    this.measurement?.noteOutcome("radar.ranked", {
      meta: { inputCount: audit.inputCount },
    });
    if (repeatCount > 0) {
      this.measurement?.noteOutcome("radar.repeat_exposure", {
        meta: { repeatCandidates: repeatCount },
      });
    }
    if (missingContext) {
      this.measurement?.noteOutcome("context.fallback", { meta: { source: "radar" } });
    }

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

  livingMapStatus() {
    return { enabled: isLivingMapEnabled(), version: LIVING_MAP_VERSION };
  }

  private async destinyPeerIds(userId: string): Promise<Set<string>> {
    if (!isDestinyV2Enabled() || !isDestinyV2ProposalsEnabled() || !this.destinyV2) {
      return new Set();
    }
    try {
      const ids = await this.destinyV2.listOpenPeerIds(userId, this.engine.clock.now());
      return new Set(ids);
    } catch {
      return new Set();
    }
  }

  private projectAuthorized(
    userId: string,
    ranked: { userId: string; mood?: string; intention?: string }[],
    near: number,
    around: number,
    destinyPeers: Set<string>,
  ): OpportunityPublic[] {
    const viewerLoc = this.engine.locations.get(userId);
    if (!viewerLoc) return [];
    const out: OpportunityPublic[] = [];
    for (const c of ranked) {
      if (c.userId === userId) continue;
      const otherLoc = this.engine.locations.get(c.userId);
      if (!otherLoc) continue;
      const other = this.engine.users.get(c.userId);
      const presence = this.engine.presence.get(c.userId);
      const meters = distanceMeters(viewerLoc, otherLoc);
      const opp = projectOpportunity({
        viewerId: userId,
        otherId: c.userId,
        meters,
        bearingDeg: bearingDegrees(viewerLoc, otherLoc),
        nearM: near,
        aroundM: around,
        mood: c.mood ?? other?.profile.mood,
        intention: c.intention ?? other?.profile.intention,
        interests: other?.profile.interests,
        expiresAt: presence?.expiresAt,
        destiny: destinyPeers.has(c.userId),
        visibility: presence?.visibility,
      });
      out.push(opp);
    }
    return out;
  }

  async opportunities(
    userId: string,
    near: number,
    around: number,
    filters: LivingMapFilters = {},
  ) {
    const ranked = this.candidates(userId, near, around);
    const destinyPeers = await this.destinyPeerIds(userId);
    const projected = this.projectAuthorized(userId, ranked.candidates, near, around, destinyPeers);
    const filtered = filterOpportunities(projected, filters);
    const bounded = boundOpportunities(filtered);
    const body = {
      enabled: isLivingMapEnabled(),
      opportunities: bounded.opportunities,
      clusters: bounded.clusters,
      truncated: bounded.truncated,
      count: filtered.length,
      serverTime: ranked.serverTime,
    };
    if (payloadLeaksCoordinates(body)) {
      throw new DomainError("CONFLICT", "Living Map privacy invariant failed");
    }
    return body;
  }

  async discover(userId: string, near: number, around: number, filters: LivingMapFilters = {}) {
    const body = await this.opportunities(userId, near, around, filters);
    return {
      enabled: body.enabled,
      opportunities: body.opportunities,
      count: body.count,
      serverTime: body.serverTime,
    };
  }

  async pulse(userId: string, near: number, around: number) {
    try {
      const ranked = this.candidates(userId, near, around);
      const projected = this.projectAuthorized(userId, ranked.candidates, near, around, new Set());
      const agg = aggregatePulse(projected);
      const body = { enabled: isLivingMapEnabled(), ...agg, serverTime: ranked.serverTime };
      if (payloadLeaksCoordinates(body)) {
        throw new DomainError("CONFLICT", "Pulse privacy invariant failed");
      }
      return body;
    } catch (e) {
      if (e instanceof DomainError && e.code === "NOT_FOUND") {
        return { enabled: isLivingMapEnabled(), ...quietPulse(), serverTime: this.engine.clock.now().toISOString() };
      }
      throw e;
    }
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
    return {
      presence: await this.radar.activate(userId, body),
      viewerPlace: publicViewerPlace(body.lat, body.lng),
    };
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
    const presence = await this.radar.heartbeat(userId, body);
    const loc =
      body.lat !== undefined && body.lng !== undefined
        ? { lat: body.lat, lng: body.lng }
        : null;
    return {
      presence,
      viewerPlace: loc ? publicViewerPlace(loc.lat, loc.lng) : null,
    };
  }

  @Get("candidates")
  candidates(
    @CurrentUser() userId: string,
    @Query("nearRadiusM") near?: string,
    @Query("aroundRadiusM") around?: string,
  ) {
    return this.radar.candidates(userId, Number(near ?? 50), Number(around ?? 200));
  }

  @Get("living-map")
  livingMap() {
    return this.radar.livingMapStatus();
  }

  @Get("opportunities")
  opportunities(
    @CurrentUser() userId: string,
    @Query("nearRadiusM") near?: string,
    @Query("aroundRadiusM") around?: string,
    @Query("proximity") proximity?: string,
    @Query("presence") presence?: string,
    @Query("intention") intention?: string,
    @Query("interests") interests?: string,
  ) {
    return this.radar.opportunities(
      userId,
      Number(near ?? 50),
      Number(around ?? 200),
      parseFilters({ proximity, presence, intention, interests }),
    );
  }

  @Get("discover")
  discover(
    @CurrentUser() userId: string,
    @Query("nearRadiusM") near?: string,
    @Query("aroundRadiusM") around?: string,
    @Query("proximity") proximity?: string,
    @Query("presence") presence?: string,
    @Query("intention") intention?: string,
    @Query("interests") interests?: string,
  ) {
    return this.radar.discover(
      userId,
      Number(near ?? 50),
      Number(around ?? 200),
      parseFilters({ proximity, presence, intention, interests }),
    );
  }

  @Get("pulse")
  pulse(
    @CurrentUser() userId: string,
    @Query("nearRadiusM") near?: string,
    @Query("aroundRadiusM") around?: string,
  ) {
    return this.radar.pulse(userId, Number(near ?? 50), Number(around ?? 200));
  }
}

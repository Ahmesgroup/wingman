import { Body, Controller, Get, Inject, Injectable, Post, Query } from "@nestjs/common";
import { ActivateRadarSchema, HeartbeatSchema } from "@wingman/contracts";
import type { PresenceVisibility, WingmanEngine } from "@wingman/domain";
import type { EphemeralStore } from "@wingman/ephemeral";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";

@Injectable()
export class RadarService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(EPHEMERAL_STORE) private readonly ephemeral: EphemeralStore,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
  ) {}

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
    return presence;
  }

  async deactivate(userId: string) {
    const presence = this.engine.deactivateRadar(userId);
    await this.ephemeral.deletePresence(userId);
    await this.mirror.mirrorPresence(userId);
    return presence;
  }

  async heartbeat(userId: string, body: { lat?: number; lng?: number }) {
    const location =
      body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : undefined;
    const presence = this.engine.heartbeat(userId, location);
    await this.ephemeral.heartbeat(userId, 120, location);
    await this.mirror.mirrorPresence(userId);
    return presence;
  }

  candidates(userId: string, near: number, around: number) {
    const candidates = this.engine.getCandidates(userId, near, around);
    return { candidates, serverTime: this.engine.clock.now().toISOString() };
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

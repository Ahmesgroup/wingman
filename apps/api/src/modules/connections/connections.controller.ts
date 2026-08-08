import { Body, Controller, Get, Inject, Injectable, Param, Post } from "@nestjs/common";
import { DomainError, type WingmanEngine } from "@wingman/domain";
import { MissionMessageSchema, OutcomeSchema, SelfieSchema } from "@wingman/contracts";
import type { NotificationOrchestrator } from "@wingman/notifications";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { NOTIFICATION_ORCH, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";

@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(NOTIFICATION_ORCH) private readonly notifications: NotificationOrchestrator,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
  ) {}

  get(id: string) {
    const connection = this.engine.connections.get(id);
    if (!connection) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    return { connection, serverTime: this.engine.clock.now().toISOString() };
  }

  async selfie(id: string, userId: string, mediaId: string) {
    const c = this.engine.connections.get(id);
    if (!c) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    const event = userId === c.initiatorId ? "initiator_selfie" : "recipient_selfie";
    const connection = this.engine.applyConnection(id, event, userId, { mediaId });
    await this.mirror.mirrorConnection(id);
    return connection;
  }

  async approve(id: string, userId: string) {
    const connection = this.engine.applyConnection(id, "initiator_approve", userId);
    await this.mirror.mirrorConnection(id);
    this.notifications.enqueue({
      id: `push_mv_${connection.id}`,
      type: "connection.confirmed",
      userId: connection.recipientId,
      idempotencyKey: `connection.validated:${connection.id}`,
      deepLink: this.notifications.deepLinkFor("connection.confirmed", connection.id),
      payload: { connectionId: connection.id, state: connection.state },
      createdAt: new Date(),
    });
    void this.notifications.processQueue();
    return connection;
  }

  async meetNow(id: string, userId: string) {
    const connection = this.engine.applyConnection(id, "meet_now", userId);
    await this.mirror.mirrorConnection(id);
    this.notifications.enqueue({
      id: `push_mission_${connection.id}`,
      type: "mission.opened",
      userId: connection.recipientId,
      idempotencyKey: `mission.opened:${connection.id}`,
      deepLink: this.notifications.deepLinkFor("mission.opened", connection.id),
      payload: { connectionId: connection.id },
      createdAt: new Date(),
    });
    void this.notifications.processQueue();
    return connection;
  }

  async apply(id: string, event: Parameters<WingmanEngine["applyConnection"]>[1], userId: string) {
    const connection = this.engine.applyConnection(id, event, userId);
    await this.mirror.mirrorConnection(id);
    return connection;
  }

  message(id: string, userId: string, text: string) {
    return this.engine.postMissionMessage(id, userId, text);
  }

  async outcome(id: string, userId: string, outcome: "YES" | "NO") {
    const connection = this.engine.recordOutcome(id, userId, outcome);
    await this.mirror.mirrorConnection(id);
    return connection;
  }
}

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get(":id")
  get(@Param("id") id: string) {
    return this.connections.get(id);
  }

  @Post(":id/selfie")
  async selfie(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SelfieSchema)) body: { mediaId: string },
  ) {
    return { connection: await this.connections.selfie(id, userId, body.mediaId) };
  }

  @Post(":id/approve")
  async approve(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.approve(id, userId) };
  }

  @Post(":id/meet-now")
  async meetNow(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.meetNow(id, userId) };
  }

  @Post(":id/ticket")
  async ticket(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.apply(id, "hold_ticket", userId) };
  }

  @Post(":id/ticket/available")
  async ticketAvailable(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.apply(id, "ticket_available", userId) };
  }

  @Post(":id/ticket/confirm")
  async ticketConfirm(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.apply(id, "ticket_confirm", userId) };
  }

  @Post(":id/lets-meet")
  async letsMeet(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.apply(id, "lets_meet", userId) };
  }

  @Post(":id/not-this-time")
  async notThisTime(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.apply(id, "not_this_time", userId) };
  }

  @Post(":id/messages")
  messages(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(MissionMessageSchema)) body: { text: string },
  ) {
    return { message: this.connections.message(id, userId, body.text) };
  }

  @Post(":id/outcome")
  async outcome(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(OutcomeSchema)) body: { outcome: "YES" | "NO" },
  ) {
    return { connection: await this.connections.outcome(id, userId, body.outcome) };
  }

  @Post(":id/cooldown/skip")
  async cooldownSkip(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.apply(id, "cooldown_skip", userId) };
  }
}

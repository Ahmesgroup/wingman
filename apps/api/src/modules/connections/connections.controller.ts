import { Body, Controller, Get, Inject, Injectable, Param, Post } from "@nestjs/common";
import { DomainError, type WingmanEngine } from "@wingman/domain";
import { MissionMessageSchema, OutcomeSchema, SelfieSchema } from "@wingman/contracts";
import type { NotificationOrchestrator } from "@wingman/notifications";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { NOTIFICATION_ORCH } from "../infra/infra.tokens.js";

@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(NOTIFICATION_ORCH) private readonly notifications: NotificationOrchestrator,
  ) {}

  get(id: string) {
    const connection = this.engine.connections.get(id);
    if (!connection) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    return { connection, serverTime: this.engine.clock.now().toISOString() };
  }

  selfie(id: string, userId: string, mediaId: string) {
    const c = this.engine.connections.get(id);
    if (!c) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    const event = userId === c.initiatorId ? "initiator_selfie" : "recipient_selfie";
    return this.engine.applyConnection(id, event, userId, { mediaId });
  }

  approve(id: string, userId: string) {
    const connection = this.engine.applyConnection(id, "initiator_approve", userId);
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

  meetNow(id: string, userId: string) {
    const connection = this.engine.applyConnection(id, "meet_now", userId);
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

  apply(id: string, event: Parameters<WingmanEngine["applyConnection"]>[1], userId: string) {
    return this.engine.applyConnection(id, event, userId);
  }

  message(id: string, userId: string, text: string) {
    return this.engine.postMissionMessage(id, userId, text);
  }

  outcome(id: string, userId: string, outcome: "YES" | "NO") {
    return this.engine.recordOutcome(id, userId, outcome);
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
  selfie(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SelfieSchema)) body: { mediaId: string },
  ) {
    return { connection: this.connections.selfie(id, userId, body.mediaId) };
  }

  @Post(":id/approve")
  approve(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: this.connections.approve(id, userId) };
  }

  @Post(":id/meet-now")
  meetNow(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: this.connections.meetNow(id, userId) };
  }

  @Post(":id/ticket")
  ticket(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: this.connections.apply(id, "hold_ticket", userId) };
  }

  @Post(":id/ticket/available")
  ticketAvailable(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: this.connections.apply(id, "ticket_available", userId) };
  }

  @Post(":id/ticket/confirm")
  ticketConfirm(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: this.connections.apply(id, "ticket_confirm", userId) };
  }

  @Post(":id/lets-meet")
  letsMeet(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: this.connections.apply(id, "lets_meet", userId) };
  }

  @Post(":id/not-this-time")
  notThisTime(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: this.connections.apply(id, "not_this_time", userId) };
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
  outcome(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(OutcomeSchema)) body: { outcome: "YES" | "NO" },
  ) {
    return { connection: this.connections.outcome(id, userId, body.outcome) };
  }

  @Post(":id/cooldown/skip")
  cooldownSkip(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: this.connections.apply(id, "cooldown_skip", userId) };
  }
}

import { Body, Controller, Get, Inject, Injectable, Optional, Param, Post } from "@nestjs/common";
import { DomainError, type WingmanEngine } from "@wingman/domain";
import { MissionMessageSchema, OutcomeSchema, SelfieSchema } from "@wingman/contracts";
import type { NotificationOrchestrator } from "@wingman/notifications";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { NOTIFICATION_ORCH, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "../realtime/realtime-app.service.js";
import { MeasurementGate } from "../measurement/measurement.module.js";

function safeNotify(orch: NotificationOrchestrator): void {
  void orch.processQueue().catch(() => {});
}

@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(NOTIFICATION_ORCH) private readonly notifications: NotificationOrchestrator,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
    private readonly realtime: RealtimeAppService,
    @Optional() private readonly measurement?: MeasurementGate,
  ) {}

  get(id: string) {
    const connection = this.engine.connections.get(id);
    if (!connection) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    return { connection, serverTime: this.engine.clock.now().toISOString() };
  }

  private async publishConnection(connection: { id: string; initiatorId: string; recipientId: string; state: string }, type: "validation.updated" | "mission.updated" | "connection.closed") {
    await this.realtime.publish({
      type,
      aggregateId: connection.id,
      rooms: [
        this.realtime.userRoom(connection.initiatorId),
        this.realtime.userRoom(connection.recipientId),
        this.realtime.connectionRoom(connection.id),
        this.realtime.missionRoom(connection.id),
      ],
      payload: { connectionId: connection.id, state: connection.state },
    });
  }

  async selfie(id: string, userId: string, mediaId: string) {
    const c = this.engine.connections.get(id);
    if (!c) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    const event = userId === c.initiatorId ? "initiator_selfie" : "recipient_selfie";
    const connection = this.engine.applyConnection(id, event, userId, { mediaId });
    await this.mirror.mirrorConnection(id);
    await this.publishConnection(connection, "validation.updated");
    return connection;
  }

  async approve(id: string, userId: string) {
    const connection = this.engine.applyConnection(id, "initiator_approve", userId);
    await this.mirror.mirrorConnection(id);
    this.notifications.handleAppEvent({
      type: "connection.confirmed",
      userId: connection.recipientId,
      aggregateId: connection.id,
      payload: { connectionId: connection.id, state: connection.state },
    });
    safeNotify(this.notifications);
    await this.publishConnection(connection, "validation.updated");
    return connection;
  }

  async meetNow(id: string, userId: string) {
    const connection = this.engine.applyConnection(id, "meet_now", userId);
    await this.mirror.mirrorConnection(id);
    if (connection.state === "MISSION_MEET_ACTIVE") {
      this.measurement?.noteDecision("CORE_CONNECTION", "1.0.0", "mission_enter", {
        actorId: userId,
        meta: { via: "meet_now" },
      });
      this.measurement?.noteOutcome("mission.entered", { meta: { via: "meet_now" } });
    }
    for (const uid of [connection.initiatorId, connection.recipientId]) {
      this.notifications.handleAppEvent({
        type: "mission.updated",
        userId: uid,
        aggregateId: connection.id,
        payload: { connectionId: connection.id, state: connection.state },
      });
    }
    safeNotify(this.notifications);
    await this.publishConnection(connection, "mission.updated");
    return connection;
  }

  async apply(id: string, event: Parameters<WingmanEngine["applyConnection"]>[1], userId: string) {
    const connection = this.engine.applyConnection(id, event, userId);
    await this.mirror.mirrorConnection(id);
    if (connection.state === "MISSION_MEET_ACTIVE" && (event === "meet_now" || event === "ticket_confirm")) {
      this.measurement?.noteDecision("CORE_CONNECTION", "1.0.0", "mission_enter", {
        actorId: userId,
        meta: { via: event },
      });
      this.measurement?.noteOutcome("mission.entered", { meta: { via: event } });
    }
    if (connection.state === "COMPLETED") {
      this.measurement?.noteDecision("CORE_CONNECTION", "1.0.0", "mission_complete", {
        actorId: userId,
        meta: { via: event },
      });
      this.measurement?.noteOutcome("mission.completed", { meta: { via: event } });
    }
    const closed = ["EXPIRED", "CANCELLED", "BLOCKED", "COMPLETED", "FAILED"].includes(connection.state);
    if (!closed) {
      for (const uid of [connection.initiatorId, connection.recipientId]) {
        this.notifications.handleAppEvent({
          type: "mission.updated",
          userId: uid,
          aggregateId: connection.id,
          payload: { connectionId: connection.id, state: connection.state },
        });
      }
      safeNotify(this.notifications);
    }
    await this.publishConnection(connection, closed ? "connection.closed" : "mission.updated");
    return connection;
  }

  message(id: string, userId: string, text: string) {
    return this.engine.postMissionMessage(id, userId, text);
  }

  async outcome(id: string, userId: string, outcome: "YES" | "NO") {
    const connection = this.engine.recordOutcome(id, userId, outcome);
    await this.mirror.mirrorConnection(id);
    // Both parties answered → cooldown = completed encounter for baseline purposes
    if (connection.state === "COOLDOWN_ACTIVE" || connection.state === "COMPLETED") {
      this.measurement?.noteDecision("CORE_CONNECTION", "1.0.0", "mission_complete", {
        actorId: userId,
        meta: { via: "outcome", state: connection.state },
      });
      this.measurement?.noteOutcome("mission.completed", {
        meta: { via: "outcome", state: connection.state },
      });
    }
    for (const uid of [connection.initiatorId, connection.recipientId]) {
      this.notifications.handleAppEvent({
        type: "mission.updated",
        userId: uid,
        aggregateId: connection.id,
        payload: { connectionId: connection.id, state: connection.state },
      });
    }
    safeNotify(this.notifications);
    await this.publishConnection(connection, "mission.updated");
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

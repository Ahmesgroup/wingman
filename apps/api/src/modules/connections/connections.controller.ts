import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Injectable,
  Optional,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DomainError, WINDOWS_MS, type WingmanEngine } from "@wingman/domain";
import { MissionMessageSchema, OutcomeSchema, SelfieSchema } from "@wingman/contracts";
import { isMediaExpired, type MediaStore } from "@wingman/media";
import type { NotificationOrchestrator } from "@wingman/notifications";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { MEDIA_STORE, NOTIFICATION_ORCH, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";
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
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    private readonly realtime: RealtimeAppService,
    @Optional() private readonly measurement?: MeasurementGate,
  ) {}

  get(id: string, userId: string) {
    const connection = this.requireParticipant(id, userId);
    return { connection, serverTime: this.engine.clock.now().toISOString() };
  }

  private requireParticipant(id: string, userId: string) {
    const c = this.engine.connections.get(id);
    if (!c) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    if (userId !== c.initiatorId && userId !== c.recipientId) {
      throw new DomainError("NOT_FOUND", "Not a participant");
    }
    return c;
  }

  async uploadMedia(id: string, userId: string, file: { buffer: Buffer; mimetype?: string; size: number }) {
    const c = this.requireParticipant(id, userId);
    if (!file?.buffer?.length) {
      throw new DomainError("VALIDATION_REQUIRED", "Selfie file required");
    }
    const contentType = (file.mimetype || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
    const capturedAt = this.engine.clock.now();
    try {
      const meta = await this.media.put({
        connectionId: id,
        uploaderId: userId,
        contentType,
        body: new Uint8Array(file.buffer),
        createdAt: capturedAt,
        expiresAt: c.expiresAt ?? new Date(capturedAt.getTime() + WINDOWS_MS.SELFIE),
      });
      return {
        mediaId: meta.mediaId,
        contentType: meta.contentType,
        byteLength: meta.byteLength,
        capturedAt: meta.createdAt.toISOString(),
        expiresAt: meta.expiresAt.toISOString(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("UNSUPPORTED_MEDIA_TYPE")) {
        throw new DomainError("VALIDATION_REQUIRED", "Unsupported media type", { contentType });
      }
      if (msg.startsWith("MEDIA_SIZE_INVALID")) {
        throw new DomainError("VALIDATION_REQUIRED", "Media size invalid");
      }
      throw e;
    }
  }

  async getMedia(id: string, userId: string, mediaId: string) {
    const c = this.requireParticipant(id, userId);
    const bytes = await this.media.getBytes(mediaId);
    if (!bytes || bytes.meta.connectionId !== id) {
      throw new DomainError("NOT_FOUND", "Media not found");
    }
    if (isMediaExpired(bytes.meta, this.engine.clock.now())) {
      try {
        await this.media.delete(mediaId);
      } catch {
        /* best-effort; TTL sweep remains */
      }
      throw new DomainError("NOT_FOUND", "Media not found");
    }
    const isUploader = bytes.meta.uploaderId === userId;
    const bound =
      c.initiatorSelfieMediaId === mediaId || c.recipientSelfieMediaId === mediaId;
    // Own upload may be previewed; peer access only after opaque id is bound on Connection.
    if (!isUploader && !bound) {
      throw new DomainError("NOT_FOUND", "Media not found");
    }
    return bytes;
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
    const meta = await this.media.getMeta(mediaId);
    if (!meta || meta.connectionId !== id || meta.uploaderId !== userId) {
      throw new DomainError("NOT_FOUND", "Opaque mediaId not registered for this connection uploader");
    }
    if (isMediaExpired(meta, this.engine.clock.now())) {
      throw new DomainError("NOT_FOUND", "Opaque mediaId expired");
    }
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
    if (closed) {
      try {
        await this.media.deleteByConnection(id);
      } catch {
        /* purge best-effort; lifecycle backstop remains */
      }
    }
    await this.publishConnection(connection, closed ? "connection.closed" : "mission.updated");
    return connection;
  }

  async message(id: string, userId: string, text: string) {
    this.requireParticipant(id, userId);
    const message = this.engine.postMissionMessage(id, userId, text);
    const c = this.engine.connections.get(id);
    if (c) {
      const peerId = userId === c.initiatorId ? c.recipientId : c.initiatorId;
      this.notifications.handleAppEvent({
        type: "mission.message",
        userId: peerId,
        aggregateId: id,
        payload: { connectionId: id, summary: "New message in your meeting" },
      });
      safeNotify(this.notifications);
      await this.realtime.publish({
        type: "mission.message",
        aggregateId: id,
        rooms: [
          this.realtime.userRoom(c.initiatorId),
          this.realtime.userRoom(c.recipientId),
          this.realtime.connectionRoom(id),
          this.realtime.missionRoom(id),
        ],
        payload: {
          connectionId: id,
          senderId: message.senderId,
          text: message.text,
          filtered: message.filtered,
          at: message.at instanceof Date ? message.at.toISOString() : message.at,
        },
      });
    }
    return message;
  }

  messages(id: string, userId: string) {
    const c = this.engine.connections.get(id);
    if (!c) throw new DomainError("CONNECTION_NOT_FOUND", "Not found");
    if (userId !== c.initiatorId && userId !== c.recipientId) {
      throw new DomainError("NOT_FOUND", "Not a participant");
    }
    const messages = this.engine.missionMessages
      .filter((m) => m.connectionId === id)
      .map((m) => ({
        connectionId: m.connectionId,
        senderId: m.senderId,
        text: m.text,
        at: m.at.toISOString(),
      }));
    return { messages, serverTime: this.engine.clock.now().toISOString() };
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
  get(@CurrentUser() userId: string, @Param("id") id: string) {
    return this.connections.get(id, userId);
  }

  @Post(":id/media")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2_500_000 } }))
  async uploadMedia(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new DomainError("VALIDATION_REQUIRED", "Selfie file required");
    return this.connections.uploadMedia(id, userId, file);
  }

  @Get(":id/media/:mediaId")
  @Header("Cache-Control", "no-store, private")
  @Header("Content-Disposition", "inline")
  async getMedia(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Param("mediaId") mediaId: string,
  ): Promise<StreamableFile> {
    const bytes = await this.connections.getMedia(id, userId, mediaId);
    return new StreamableFile(Buffer.from(bytes.body), {
      type: bytes.meta.contentType,
      disposition: "inline",
    });
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

  /** Close mission chat → OUTCOME_PENDING (MISSION_CONFIRMED only). */
  @Post(":id/finish")
  async finish(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.apply(id, "chat_closed", userId) };
  }

  @Post(":id/not-this-time")
  async notThisTime(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.connections.apply(id, "not_this_time", userId) };
  }

  @Post(":id/messages")
  async postMessages(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(MissionMessageSchema)) body: { text: string },
  ) {
    return { message: await this.connections.message(id, userId, body.text) };
  }

  @Get(":id/messages")
  listMessages(@CurrentUser() userId: string, @Param("id") id: string) {
    return this.connections.messages(id, userId);
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

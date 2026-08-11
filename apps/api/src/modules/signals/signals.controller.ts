import { Body, Controller, Inject, Injectable, Optional, Param, Post } from "@nestjs/common";
import { CreateSignalSchema } from "@wingman/contracts";
import type { WingmanEngine } from "@wingman/domain";
import type { EphemeralStore } from "@wingman/ephemeral";
import type { NotificationOrchestrator } from "@wingman/notifications";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { CurrentUser, IdempotencyKey } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE, NOTIFICATION_ORCH, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "../realtime/realtime-app.service.js";
import { AntiAbuseGate } from "../anti-abuse/anti-abuse.module.js";
import { MeasurementGate } from "../measurement/measurement.module.js";

function safeNotify(orch: NotificationOrchestrator): void {
  void orch.processQueue().catch(() => {
    /* provider outage must never fail protocol mutations */
  });
}

@Injectable()
export class SignalsService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(EPHEMERAL_STORE) private readonly ephemeral: EphemeralStore,
    @Inject(NOTIFICATION_ORCH) private readonly notifications: NotificationOrchestrator,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
    private readonly realtime: RealtimeAppService,
    @Optional() private readonly antiAbuse?: AntiAbuseGate,
    @Optional() private readonly measurement?: MeasurementGate,
  ) {}

  async create(
    userId: string,
    body: { receiverId: string; source: "RADAR" | "DESTINY" | "REMATCH" },
    idem?: string,
  ) {
    this.antiAbuse?.assertAllowed(userId, "SIGNAL_CREATE");
    const signal = this.engine.sendSignal(userId, body.receiverId, idem, body.source);
    this.antiAbuse?.note("signal.sent", userId, {
      subjectId: body.receiverId,
      eventId: idem ? `signal-idem:${userId}:${idem}` : undefined,
      evaluate: true,
    });
    this.measurement?.noteDecision("CORE_SIGNAL", "1.0.0", "signal_create", {
      actorId: userId,
      meta: { source: body.source },
    });
    const latencyMs = this.measurement?.takeTimeToSignalMs(userId);
    this.measurement?.noteOutcome("signal.created", {
      meta: {
        source: body.source,
        ...(latencyMs !== undefined ? { latencyMs } : {}),
      },
    });
    await this.mirror.mirrorSignal(signal.id);
    await this.mirror.mirrorSignalUsage(userId);
    this.notifications.handleAppEvent({
      type: "signal.received",
      userId: body.receiverId,
      aggregateId: signal.id,
      payload: { signalId: signal.id, senderId: userId },
    });
    safeNotify(this.notifications);
    await this.realtime.publish({
      type: "signal.received",
      aggregateId: signal.id,
      rooms: [this.realtime.userRoom(body.receiverId)],
      payload: { signalId: signal.id, senderId: userId, status: signal.status },
    });
    return { signal };
  }

  async open(id: string, userId: string) {
    const signal = this.engine.openSignal(id, userId);
    await this.mirror.mirrorSignal(id);
    await this.realtime.publish({
      type: "signal.updated",
      aggregateId: id,
      rooms: [this.realtime.userRoom(signal.senderId), this.realtime.userRoom(signal.receiverId)],
      payload: { signalId: id, status: signal.status },
    });
    return signal;
  }

  async refuse(id: string, userId: string) {
    const signal = this.engine.refuseSignal(id, userId);
    // Attribute refuse pattern to the original sender (subject = receiver who refused)
    this.antiAbuse?.note("signal.refused_by_target", signal.senderId, {
      subjectId: userId,
      eventId: `refuse:${id}`,
      evaluate: true,
    });
    await this.mirror.mirrorSignal(id);
    await this.realtime.publish({
      type: "signal.updated",
      aggregateId: id,
      rooms: [this.realtime.userRoom(signal.senderId), this.realtime.userRoom(signal.receiverId)],
      payload: { signalId: id, status: signal.status },
    });
    return signal;
  }

  async cancel(id: string, userId: string) {
    const signal = this.engine.cancelSignal(id, userId);
    await this.mirror.mirrorSignal(id);
    await this.realtime.publish({
      type: "signal.updated",
      aggregateId: id,
      rooms: [this.realtime.userRoom(signal.senderId), this.realtime.userRoom(signal.receiverId)],
      payload: { signalId: id, status: signal.status },
    });
    return signal;
  }

  async accept(id: string, userId: string) {
    const lockKey = `signal-accept:${id}`;
    const owner = `api:${process.pid}:${userId}`;
    const got = await this.ephemeral.acquireLock(lockKey, owner, 15);
    if (!got) {
      const connection = this.engine.acceptSignal(id, userId);
      await this.mirror.mirrorAccept(id, connection.id);
      this.measurement?.noteDecision("CORE_SIGNAL", "1.0.0", "connection_open", { actorId: userId });
      this.measurement?.noteOutcome("connection.opened");
      return connection;
    }
    try {
      const connection = this.engine.acceptSignal(id, userId);
      await this.mirror.mirrorAccept(id, connection.id);
      this.measurement?.noteDecision("CORE_SIGNAL", "1.0.0", "connection_open", { actorId: userId });
      this.measurement?.noteOutcome("connection.opened");
      this.notifications.handleAppEvent({
        type: "match.created",
        userId: connection.initiatorId,
        aggregateId: connection.id,
        payload: { connectionId: connection.id, state: connection.state },
      });
      this.notifications.handleAppEvent({
        type: "match.created",
        userId: connection.recipientId,
        aggregateId: connection.id,
        payload: { connectionId: connection.id, state: connection.state },
      });
      safeNotify(this.notifications);
      await this.realtime.publish({
        type: "match.created",
        aggregateId: connection.id,
        rooms: [
          this.realtime.userRoom(connection.initiatorId),
          this.realtime.userRoom(connection.recipientId),
          this.realtime.connectionRoom(connection.id),
        ],
        payload: { connectionId: connection.id, state: connection.state },
      });
      return connection;
    } finally {
      await this.ephemeral.releaseLock(lockKey, owner);
    }
  }
}

@Controller("signals")
export class SignalsController {
  constructor(private readonly signals: SignalsService) {}

  @Post()
  create(
    @CurrentUser() userId: string,
    @IdempotencyKey() idem: string | undefined,
    @Body(new ZodValidationPipe(CreateSignalSchema))
    body: { receiverId: string; source: "RADAR" | "DESTINY" | "REMATCH" },
  ) {
    return this.signals.create(userId, body, idem);
  }

  @Post(":id/open")
  async open(@CurrentUser() userId: string, @Param("id") id: string) {
    return { signal: await this.signals.open(id, userId) };
  }

  @Post(":id/refuse")
  async refuse(@CurrentUser() userId: string, @Param("id") id: string) {
    return { signal: await this.signals.refuse(id, userId) };
  }

  @Post(":id/cancel")
  async cancel(@CurrentUser() userId: string, @Param("id") id: string) {
    return { signal: await this.signals.cancel(id, userId) };
  }

  @Post(":id/accept")
  async accept(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.signals.accept(id, userId) };
  }
}

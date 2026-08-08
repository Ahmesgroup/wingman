import { Body, Controller, Inject, Injectable, Param, Post } from "@nestjs/common";
import { CreateSignalSchema } from "@wingman/contracts";
import type { WingmanEngine } from "@wingman/domain";
import type { EphemeralStore } from "@wingman/ephemeral";
import { NotificationOrchestrator, type PushEvent } from "@wingman/notifications";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { CurrentUser, IdempotencyKey } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE, NOTIFICATION_ORCH, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";

@Injectable()
export class SignalsService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(EPHEMERAL_STORE) private readonly ephemeral: EphemeralStore,
    @Inject(NOTIFICATION_ORCH) private readonly notifications: NotificationOrchestrator,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
  ) {}

  async create(
    userId: string,
    body: { receiverId: string; source: "RADAR" | "DESTINY" | "REMATCH" },
    idem?: string,
  ) {
    const signal = this.engine.sendSignal(userId, body.receiverId, idem, body.source);
    await this.mirror.mirrorSignal(signal.id);
    const event: PushEvent = {
      id: `push_${signal.id}`,
      type: "signal.received",
      userId: body.receiverId,
      idempotencyKey: `signal.received:${signal.id}`,
      deepLink: this.notifications.deepLinkFor("signal.received", signal.id),
      payload: { signalId: signal.id },
      createdAt: new Date(),
    };
    this.notifications.enqueue(event);
    void this.notifications.processQueue();
    void this.ephemeral.publish(
      "wingman.events",
      JSON.stringify({ type: "signal.received", signalId: signal.id }),
    );
    return { signal };
  }

  async open(id: string, userId: string) {
    const signal = this.engine.openSignal(id, userId);
    await this.mirror.mirrorSignal(id);
    return signal;
  }

  async refuse(id: string, userId: string) {
    const signal = this.engine.refuseSignal(id, userId);
    await this.mirror.mirrorSignal(id);
    return signal;
  }

  async cancel(id: string, userId: string) {
    const signal = this.engine.cancelSignal(id, userId);
    await this.mirror.mirrorSignal(id);
    return signal;
  }

  async accept(id: string, userId: string) {
    const lockKey = `signal-accept:${id}`;
    const owner = `api:${process.pid}:${userId}`;
    const got = await this.ephemeral.acquireLock(lockKey, owner, 15);
    if (!got) {
      const connection = this.engine.acceptSignal(id, userId);
      await this.mirror.mirrorSignal(id);
      await this.mirror.mirrorConnection(connection.id);
      return connection;
    }
    try {
      const connection = this.engine.acceptSignal(id, userId);
      await this.mirror.mirrorSignal(id);
      await this.mirror.mirrorConnection(connection.id);
      this.notifications.enqueue({
        id: `push_conn_${connection.id}`,
        type: "connection.confirmed",
        userId: connection.initiatorId,
        idempotencyKey: `connection.created:${connection.id}`,
        deepLink: this.notifications.deepLinkFor("connection.confirmed", connection.id),
        payload: { connectionId: connection.id },
        createdAt: new Date(),
      });
      void this.notifications.processQueue();
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
